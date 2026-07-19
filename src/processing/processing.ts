import {Injectable, Logger, OnModuleDestroy, OnModuleInit} from "@nestjs/common";
import {EventEmitter2, OnEvent} from "@nestjs/event-emitter";
import {FlarmEvents} from "../shared/FlarmEvents";
import {FlarmData} from "../flarm-ogn/flarm-ogn.service";
import {LoginService} from "../helios/apiservice/login.service";
import {HeliosInboundWorker} from "../helios/helios-inbound-worker";
import {HeliosStartDataset, HeliosVliegtuigenDataset} from "../types/Helios";
import {GliderEvents} from "../shared/GliderEvents";
import {GliderStatus} from "../shared/GliderStatus";
import {DateTime, Interval} from "luxon";
import {WebSocketEvents} from "../shared/WebSocketEvents";
import {HeliosEvents} from "../shared/HeliosEvents";
import {ParsedLogger} from "./parsed-logger";
import {Cron, CronExpression} from "@nestjs/schedule";

export enum StartMethode {
    Lier = 550,
    Sleep= 501,
    Zelfstart = 506
}
// Eén Flarm-bericht van een vliegtuig, verrijkt met de laatst bekende status (vliegend, geland, ...)
// en met de bijbehorende Helios-gegevens (vliegtuig + start). Er bestaat één instantie per vliegtuig,
// die bij elk nieuw Flarm-bericht wordt vervangen (zie handleDataReceivedEvent / FlarmDataStore).
export class FlarmDataWithStatus {
    flarmData: FlarmData;
    status: GliderStatus;

    starttijd: string;
    landingstijd: string;

    REG_CALL?: string
    SLEEPKIST?: boolean
    vliegtuigID?: number
    startID?: number

    bijOnsGestart?: boolean;
    maxHoogte?: number;                     // maximale hoogte van het sleepvliegtuig tijdens de vlucht

    constructor(fData: FlarmData, vliegtuig: HeliosVliegtuigenDataset, start: HeliosStartDataset) {
        this.flarmData = fData;
        // vliegtuig/start kunnen 'undefined' zijn (bv. vliegtuig niet in Helios of nog geen start vandaag);
        // dan blijven de bijbehorende velden ook undefined in plaats van een crash te veroorzaken
        this.REG_CALL = (vliegtuig) ? vliegtuig.REG_CALL : undefined;
        this.SLEEPKIST = (vliegtuig) ? vliegtuig.SLEEPKIST : undefined;
        this.vliegtuigID = (vliegtuig) ? vliegtuig.ID : undefined;
        this.startID = (start) ? start.ID : undefined;
        this.status = GliderStatus.Unknown;
    }
}


@Injectable()
export class ProcessingService implements  OnModuleInit, OnModuleDestroy  {
    private readonly logger = new Logger(ProcessingService.name);
    private FlarmDataStore: FlarmDataWithStatus[] = [];         // laatst bekende status per vliegtuig (flarmId), zie handleDataReceivedEvent
    private positionHistory: Map<string, FlarmData[]> = new Map();  // laatste ~3 minuten aan ruwe Flarm-berichten per vliegtuig, voor bepaalStartMethode/zoekSleep
    private readonly DelayedLandingIntervalId: NodeJS.Timeout;

    constructor(private readonly eventEmitter: EventEmitter2,
                private readonly loginservice: LoginService,
                private readonly heliosInboundService: HeliosInboundWorker,
                private readonly parsedLogger: ParsedLogger) {
        this.logger = new Logger(ProcessingService.name);

        // elke 30 seconden controleren of er vliegtuigen zijn waarvan we geen Flarm-updates meer krijgen
        // terwijl ze nog in de lucht (circuit/landing) stonden, zie delayedLanding()
        // Nodig als we geen flarm berichten krijgen als vliegtuig landt (bv. te ver weg van ontvanger) of achter de bomen
        // Dan wordt landing niet gedetecteerd en blijft vliegtuig in de lucht.
        this.DelayedLandingIntervalId = setInterval(() => this.delayedLanding(), 0.50 * 60*1000);
    }

    onModuleInit() {
        this.logger.log('ProcessingService has been initialized.');
        // inloggen bij Helios bij het opstarten van de service
        this.loginservice.login().then((succes) => {
            const str:string = succes ? 'success' : 'failed';
            this.logger.log((`Helios login ${str}`));
        });
    }

    onModuleDestroy() {
        this.logger.log('ProcessingService has been destroyed.');
        // interval van delayedLanding() netjes stoppen zodat de service schoon afsluit
        clearInterval(this.DelayedLandingIntervalId);
    }

    // Kern van de software: wordt aangeroepen voor ieder binnenkomend Flarm-bericht (positie, snelheid,
    // hoogte, klimsnelheid) en bepaalt op basis daarvan of een vliegtuig aan het vliegen/landen/gestart/geland
    // is (GliderStatus). Bij een status-overgang (bv. van 'op de grond' naar 'opstijgen') wordt er een event
    // richting Helios gestuurd (GliderStart/GliderLanded/SleepHoogte) zodat de starttijd/landingstijd/sleephoogte
    // in Helios wordt bijgewerkt.
    @OnEvent(FlarmEvents.DataReceived)
    handleDataReceivedEvent(payload: FlarmData) {
        const MIN_SPEED = 30;        // km/h, ondergrens om als 'vliegend' te gelden
        const CIRCUIT_HOOGTE = 220;  // meter AGL, boven deze hoogte is het vliegtuig niet meer in het circuit maar 'aan het vliegen'
        const LANDINGS_HOOGTE = 50;  // meter AGL, onder deze hoogte wordt het vliegtuig als 'landend'/'op de grond' beschouwd

        // als het vliegtuig niet bekend is, dan doen we niets
        const vliegtuig = this.heliosInboundService.getVliegtuigByFlarmcode(payload.flarmId);
        if (vliegtuig === undefined) {
            return;
        }

        // ruwe positiegeschiedenis bijhouden (laatste ~3 min), nodig voor bepalen van de startmethode.
        this.addToHistory(payload);

        // huidige (nog niet geland) start van dit vliegtuig in Helios opzoeken, indien aanwezig
        const start = this.heliosInboundService.getStart(vliegtuig.ID);
        const fdContainer = new FlarmDataWithStatus(payload, vliegtuig, start);

        // vorige bekende status van dit vliegtuig opzoeken in de lokale cache (FlarmDataStore)
        const idx = this.FlarmDataStore.findIndex((fd) => fd?.flarmData?.flarmId === fdContainer.flarmData.flarmId);
        const previousUpdate: FlarmDataWithStatus =  this.FlarmDataStore[idx];

        // overnemen van de status en tijden van het vorige bericht
        if (idx >= 0)
        {
            fdContainer.status = previousUpdate.status;
            fdContainer.starttijd = previousUpdate.starttijd;
            fdContainer.maxHoogte = previousUpdate.maxHoogte;
            fdContainer.landingstijd = previousUpdate.landingstijd;
            fdContainer.bijOnsGestart = previousUpdate.bijOnsGestart;
        }

        // alleen statuslogica uitvoeren als we bruikbare (Kalman-gefilterde) snelheid/hoogte hebben
        if (fdContainer.flarmData.kalman_speed !== undefined && fdContainer.flarmData.kalman_altitude_agl !== undefined)
        {
            if (idx < 0)
            {
                // eerste bericht ooit van dit vliegtuig: nog geen vorige status om mee te vergelijken
                fdContainer.maxHoogte = fdContainer.flarmData.kalman_altitude_agl;
                if (fdContainer.flarmData.kalman_speed > MIN_SPEED && fdContainer.flarmData.kalman_altitude_agl > CIRCUIT_HOOGTE) {
                    // als het vliegtuig sneller dan 30 km/h vliegt en hoger dan CIRCUIT_HOOGTE, dan is het vliegtuig aan het vliegen
                    fdContainer.status = GliderStatus.Flying;
                }
            }
            else
            {
                // bijhouden van de hoogste bereikte hoogte tijdens deze vlucht (gebruikt bij sleepvliegtuigen
                // om achteraf de sleephoogte van het gesleepte zweefvliegtuig te bepalen, zie verderop)
                if ((fdContainer.flarmData.kalman_altitude_agl > previousUpdate.maxHoogte) || (previousUpdate.maxHoogte === undefined))
                    fdContainer.maxHoogte = fdContainer.flarmData.kalman_altitude_agl;

                // vlucht status moet via takeoff status gaan, dus niet in 1x van grond naar vliegen
                if (previousUpdate.status !== GliderStatus.On_Ground &&
                    fdContainer.flarmData.kalman_speed > MIN_SPEED   &&
                    fdContainer.flarmData.kalman_altitude_agl > CIRCUIT_HOOGTE)
                {
                    // als het vliegtuig sneller dan 30 km/h vliegt en hoger dan CIRCUIT_HOOGTE, dan is het vliegtuig aan het vliegen
                    fdContainer.status = GliderStatus.Flying;
                }
                else if (fdContainer.flarmData.kalman_speed > MIN_SPEED &&
                    fdContainer.flarmData.kalman_altitude_agl <= CIRCUIT_HOOGTE &&
                    fdContainer.flarmData.kalman_altitude_agl > LANDINGS_HOOGTE &&
                    (previousUpdate.status == GliderStatus.Flying) || ((previousUpdate.status == GliderStatus.TakeOff) && fdContainer.flarmData.kalman_climb < 0))
                {
                    // als het vliegtuig sneller dan 30 km/h vliegt en lager dan CIRCUIT_HOOGTE, dan is het vliegtuig in circuit
                    // Status takeoff is toegevoegd ivm kabelbreuk, dan kom je niet boven CIRCUIT_HOOGTE
                    fdContainer.status = GliderStatus.Circuit;
                }
                else if (fdContainer.flarmData.kalman_speed > MIN_SPEED && fdContainer.flarmData.kalman_altitude_agl <= LANDINGS_HOOGTE &&
                    ((previousUpdate.status == GliderStatus.Flying) || (previousUpdate.status == GliderStatus.Circuit)))
                {
                    // als het vliegtuig sneller dan 30 km/h vliegt en lager dan LANDINGS_HOOGTE, dan is het vliegtuig aan het landen
                    fdContainer.status = GliderStatus.Landing;
                }
                else if (fdContainer.flarmData.kalman_speed > MIN_SPEED &&
                         fdContainer.flarmData.kalman_altitude_agl > LANDINGS_HOOGTE && (previousUpdate.status == GliderStatus.On_Ground))
                {
                    // als het vliegtuig sneller dan 30 km/h vliegt en hoger dan LANDINGS_HOOGTE, en op de grond stond, dan is het vliegtuig aan het opstijgen
                    fdContainer.status = GliderStatus.TakeOff;

                    fdContainer.starttijd = DateTime.now().toFormat('HH:mm');
                    fdContainer.landingstijd = "";
                    // bepalen of het vliegtuig op ons eigen vliegveld is opgestegen (binnen de geo-polygon)
                    fdContainer.bijOnsGestart = this.heliosInboundService.isInsidePolygon([fdContainer.flarmData.longitude, fdContainer.flarmData.latitude]);

                    if (start)
                    {
                        // starttijd doorgeven aan Helios via helios-outbound-worker.ts
                        this.logger.log(`------- STARTING: ${vliegtuig.REG_CALL} ${start?.ID}`);
                        this.eventEmitter.emit(GliderEvents.GliderStart, start?.ID);

                        // 30 seconden later pas de startmethode (lier/sleep/zelfstart) bepalen: dan is er
                        // genoeg klim-/snelheidsdata verzameld om betrouwbaar te kunnen onderscheiden
                        // we gebruiken de hele historie om de startmethode te bepalen
                        setTimeout(() => this.bepaalStartMethode(fdContainer), 30 * 1000);
                    }
                    else
                    {
                        // vliegtuig opgestegen, maar geen start bekend in Helios voor dit vliegtuig
                        this.logger.log(`------- STARTING: ${vliegtuig.REG_CALL} NO START`);
                    }
                }
                else if (fdContainer.flarmData.kalman_speed <= MIN_SPEED &&
                         fdContainer.flarmData.kalman_altitude_agl <= LANDINGS_HOOGTE)
                {
                    // als snelheid constant is en lager dan 30 km/h en minder dan LANDINGS_HOOGTE, en bovendien op dezelfde hoogte blijft, dan staat hij stil
                    const staatStil = ((fdContainer.flarmData.kalman_speed == previousUpdate.flarmData.kalman_speed) &&
                                       Math.abs (fdContainer.flarmData.kalman_altitude_agl - previousUpdate.flarmData.kalman_altitude_agl) < 1)

                    // alleen als landing (via circuit/landing) is afgerond, of het vliegtuig al stilstond, gaan we verder;
                    // zo niet, dan is dit gewoon een vliegtuig dat al langer op de grond stilstaat en gebeurt er niets
                    if ((previousUpdate.status == GliderStatus.Circuit) ||
                        (previousUpdate.status == GliderStatus.Landing) || staatStil)
                    {
                        // alleen bij een echte overgang van circuit/landing naar stilstand registreren we een landing
                        // (was het al 'staatStil', dan is de landing al eerder verwerkt)
                        if ((previousUpdate.status == GliderStatus.Circuit) || (previousUpdate.status == GliderStatus.Landing)) {
                            fdContainer.landingstijd = DateTime.now().toFormat('HH:mm');
                            fdContainer.bijOnsGestart = false;

                            if (start)
                            {
                                // landingstijd doorgeven aan Helios via helios-outbound-worker.ts
                                this.logger.log(`------- LANDING: ${vliegtuig.REG_CALL} ${start?.ID}`);
                                this.eventEmitter.emit(GliderEvents.GliderLanded, start?.ID);
                            }
                            else
                            {
                                // vliegtuig geland, maar geen (actieve) start bekend in Helios voor dit vliegtuig
                                this.logger.log(`------- LANDING: ${vliegtuig.REG_CALL} NO START`);
                            }

                            // Het sleepvliegtuig en is nu geland. 'fdContainer.maxHoogte' is de hoogste hoogte die het
                            // sleepvliegtuig tijdens deze vlucht heeft bereikt, en dat is (bij benadering) de hoogte waarop de
                            // sleepkabel is losgemaakt: de sleephoogte (SLEEP_HOOGTE) van het GESLEEPTE
                            // zweefvliegtuig. Let op: 'start'/'start?.ID' hierboven is de start van het
                            // sleepvliegtuig zelf, NIET van het zweefvliegtuig — die moeten we apart opzoeken.
                            if (vliegtuig.SLEEPKIST)
                            {
                                // zoek de start van het zweefvliegtuig dat door dit sleepvliegtuig gesleept werd
                                // (via SLEEPKIST_ID op de start van het zweefvliegtuig, zie helios-inbound-worker.ts)
                                const gliderStart = this.heliosInboundService.getStartBySleepkistID(vliegtuig.ID);

                                if (gliderStart)
                                {
                                    // sla de sleephoogte op bij de start van het zweefvliegtuig, niet bij de sleepkist zelf
                                    this.logger.log(`------- SLEEPHOOGTE: ${vliegtuig.REG_CALL} → start ${gliderStart.ID} hoogte ${fdContainer.maxHoogte}`);
                                    this.eventEmitter.emit(GliderEvents.SleepHoogte, gliderStart.ID, fdContainer.maxHoogte);
                                }
                                else
                                {
                                    // geen gekoppeld zweefvliegtuig gevonden (bv. SLEEPKIST_ID niet correct ingevuld/gedetecteerd)
                                    this.logger.verbose(`Geen gekoppelde glider-start gevonden voor sleepvliegtuig ${vliegtuig.REG_CALL} (ID ${vliegtuig.ID})`);
                                }

                                // hoogte-teller resetten voor de volgende vlucht van dit vliegtuig
                                fdContainer.maxHoogte = undefined;
                            }
                        }
                        // controleren of dit vliegtuig (nog) aangemeld moet worden als 'aanwezig' op het vliegveld
                        this.checkAanmelden(fdContainer);
                    }
                    // in beide gevallen (net geland, of al langer stil) staat het vliegtuig nu op de grond
                    fdContainer.status = GliderStatus.On_Ground;
                }
                // elk verwerkt bericht loggen naar het bestand voor analyse/nacontrole
                this.parsedLogger.record(fdContainer);
            }
        }
        // de (mogelijk bijgewerkte) status van dit vliegtuig doorsturen naar de front-end/websocket-clients
        this.eventEmitter.emit(WebSocketEvents.PublishFlarm, fdContainer);

        // lokale cache bijwerken: nieuw vliegtuig toevoegen, of bestaande status vervangen
        if (idx < 0)
            this.FlarmDataStore.push(fdContainer);
        else
            this.FlarmDataStore[idx] = fdContainer;

        this.logger.debug(`Ontvangen: ${fdContainer.flarmData?.flarmId} ${fdContainer.REG_CALL} start ID: ${fdContainer?.startID}  GS:${fdContainer?.flarmData?.speed}|${fdContainer?.flarmData?.kalman_speed} ALT:${fdContainer?.flarmData?.altitude_agl}|${fdContainer?.flarmData?.kalman_altitude_agl} ${fdContainer?.flarmData?.climbRate}|${fdContainer?.flarmData?.kalman_climb} ${GliderStatus[fdContainer.status]}`);
    }

    // Er is al een tijd geen update ontvangen van een vliegtuig. Als het vliegtuig op circuit of landing is,
    // dan nemen we aan dat het vliegtuig geland is.
    // Dit kan gebeuren als er geen flarm updates meer binnenkomen van een vliegtuig als het vlak boven de grond is.
    // Oorzaak is meestal omdat flarm ontvangst niet meer mogelijk is doordat de ontvanger te ver weg is,
    // of geen ontvangst heeft op het vliegveld
    delayedLanding() {
        const LANDINGS_HOOGTE = 50;   // meter AGL, zelfde grens als in handleDataReceivedEvent

        const now = DateTime.now();``

        // alle vliegtuigen langslopen waarvan we de laatste bekende status hebben
        for (let i=0 ; i < this.FlarmDataStore.length; i++) {
            const fdContainer = this.FlarmDataStore[i];

            if (!fdContainer.flarmData) {
                this.logger.error(`Geen flarm data voor ${fdContainer.REG_CALL} ` + JSON.stringify(fdContainer));
                continue;
            }

            // hoe lang geleden is het laatste Flarm-bericht van dit vliegtuig ontvangen
            const diff = Interval.fromDateTimes(fdContainer.flarmData.receivedTime, now);

            // we hebben al minstens 1 minuut geen flarm data ontvangen, vliegtuig zit in landing/circuit:
            // hoogte extrapoleren op basis van de laatst bekende daalsnelheid, om een landing sneller te kunnen detecteren
            if ((diff.length('minutes') >= 1) && (fdContainer.status === GliderStatus.Landing) || (fdContainer.status === GliderStatus.Circuit))
            {
                // inschatting van de huidige hoogte op basis van de laatst bekende hoogte en daalsnelheid (klimsnelheid negatief bij dalen)
                const sec = diff.length('seconds');
                const predictedAltitude = Math.round(fdContainer.flarmData.kalman_altitude_agl + (sec * fdContainer.flarmData.kalman_climb));

                this.logger.verbose(`Predicted altitude:  ${fdContainer.REG_CALL} start ID:${fdContainer.startID}  predicted:${predictedAltitude}`);

                if (predictedAltitude < LANDINGS_HOOGTE)
                {
                    if (fdContainer.startID) {
                        // landingstijd doorgeven aan Helios, net als bij een normale landingsdetectie
                        this.logger.log(`------- PREDICTED LANDING: ${fdContainer.REG_CALL} ${fdContainer.startID}`);
                        this.eventEmitter.emit(GliderEvents.GliderLanded, fdContainer.startID );
                    }
                    else {
                        this.logger.log(`------- PREDICTED LANDING: ${fdContainer.REG_CALL} NO START`);
                    }

                    this.FlarmDataStore[i].landingstijd = DateTime.now().toFormat('HH:mm');
                    this.FlarmDataStore[i].status = GliderStatus.On_Ground;
                }
            }

            // Hierbij een vangnet: als er véél langer geen bericht meer is geweest (5 min in landing, 10 min in
            // circuit) dan gaan we er hoe dan ook van uit dat het vliegtuig geland is, ook al klopt de
            // voorspelde hoogte hierboven niet (bv. te weinig klimsnelheidsdata)
            // Een vliegtuig wat op het circuit of landing zit moet gaan landen (procedure)
            if (((diff.length('minutes') > 5) && (fdContainer.status === GliderStatus.Landing)) ||
                ((diff.length('minutes') > 10) && (fdContainer.status === GliderStatus.Circuit)))
            {
                if (fdContainer.startID) {
                    this.logger.log(`------- DELAYED LANDING: ${fdContainer.REG_CALL} ${fdContainer.startID}`);
                    this.eventEmitter.emit(GliderEvents.GliderLanded, fdContainer.startID);
                }
                else {
                    this.logger.log(`------- DELAYED LANDING: ${fdContainer.REG_CALL} NO START`);
                }

                this.FlarmDataStore[i].landingstijd = DateTime.now().toFormat('HH:mm');
                this.FlarmDataStore[i].status = GliderStatus.On_Ground;
            }
        }
    }

    // toevoegen van de geschiedenis
    private addToHistory(data: FlarmData): void {
        const flarmId = data.flarmId;

        if (!this.positionHistory.has(flarmId)) {
            this.positionHistory.set(flarmId, []);
        }
        const history = this.positionHistory.get(flarmId);
        history.push(data);

        const cutoff = data.receivedTime.minus({ minutes: 3 });
        this.positionHistory.set(flarmId, history.filter(m => m.receivedTime > cutoff));
    }

    // bepaal de startmethode op basis van ontvangen flarm data
    private bepaalStartMethode(data: FlarmDataWithStatus): void {
        const flarmId = data.flarmData.flarmId;
        const history = this.positionHistory.get(flarmId) ?? [];

        const vliegtuig = this.heliosInboundService.getVliegtuigByFlarmcode(flarmId);
        const takeoffWindow = history.filter(m => m.speed > 0); // geen stilstaande flarmberichten, dus alleen de periode waarin het vliegtuig snelheid had

        // wat is de maximale klimsnelheid geweest tijdens de start,
        // gebruik de historische flarm data (niet alleen de laatste update) om een betrouwbare bepaling te maken
        const maxClimb = takeoffWindow.length > 0
            ? Math.max(...takeoffWindow.map(m => m.kalman_climb ?? m.climbRate ?? 0))
            : 0;

        let sleepkistID = -1

        let startMethode: StartMethode;
        if (maxClimb > 10)                      // een sleepstart, of zelfstart haalt geen 10 m/s klimsnelheid
        {
            startMethode = StartMethode.Lier;
        }
        else
        {
            // zoek naar een sleepvliegtuig dat in de buurt van dit zweefvliegtuig vliegt (zelfde snelheid en koers, afstand 40-200 m)
            // we doen de aanname dat sleepkist ook flarm heeft
            sleepkistID = this.zoekSleep(flarmId);

            // kunnen we geen sleepkist vinden en zweefvliegtuig is zelfstarter, dan zelfstart
            if (sleepkistID > 0) {
                startMethode = StartMethode.Sleep;
            }
            else if (vliegtuig?.ZELFSTART) {
                startMethode = StartMethode.Zelfstart;
            }
            else {
                // klimsnelheid is laag, geen sleepkist gevonden, en geen zelfstarter, dus toch maar lierstart
                startMethode = StartMethode.Lier;
            }
        }

       this.logger.log(`StartMethode: ${vliegtuig?.REG_CALL} → ${StartMethode[startMethode]} (maxClimb: ${maxClimb.toFixed(1)} m/s, towPlane: ${sleepkistID})`);
       this.eventEmitter.emit(GliderEvents.StartMethodeDetermined, data.startID, startMethode, sleepkistID);
    }

    // op zoek naar een sleepvliegtuig dat in de buurt van het zweefvliegtuig vliegt (zelfde snelheid en koers, afstand 40-200 m)
    // we doen dat op het gemiddelde van historie, er kan namelijk verschil zitten in de ontvangst van flarm berichten van sleep en zweefvliegtuig,
    // door het gemiddelde te nemen lossen we het timing probleem op. We nemen gebruiken alleen data die in de laatste 30 seconden nog hebben bewogen (snelheid > 0)
    // Doordat zweefvliegtuig het sleepvliegtuig volgt, moeten de gemiddelde van beide vliegtuigen ongeveer hetzelfde zijn.
    // We nemen een marge van 15 m/s voor snelheid en 25 graden voor koers.
    // De laatste afstand tussen het sleepvliegtuig en het zweefvliegtuig moet tussen de 40 en 200 meter zijn. (lengte sleepkabel)

    zoekSleep(flarmId: string): number {
        const flarmSleepData = this.FlarmDataStore.filter(fd => fd.SLEEPKIST === true);
        const cutoff = DateTime.now().minus({ seconds: 30 });

        const recentMoving = (id: string) =>
            (this.positionHistory.get(id) ?? []).filter(m => m.receivedTime > cutoff && (m.kalman_speed ?? 0) > 0);

        const avgSpeed = (msgs: FlarmData[]) =>
            msgs.reduce((s, m) => s + (m.kalman_speed ?? 0), 0) / msgs.length;

        const avgCourse = (msgs: FlarmData[]) => {
            const sinSum = msgs.reduce((s, m) => s + Math.sin(m.course * Math.PI / 180), 0);
            const cosSum = msgs.reduce((s, m) => s + Math.cos(m.course * Math.PI / 180), 0);
            return (Math.atan2(sinSum, cosSum) * 180 / Math.PI + 360) % 360;
        };

        const gliderHistory = recentMoving(flarmId);
        if (gliderHistory.length === 0) {
            this.logger.debug(`No recent moving history for glider ${flarmId}, cannot determine tow plane.`);
            return -1;
        }

        const gSpeed  = avgSpeed(gliderHistory);
        const gCourse = avgCourse(gliderHistory);
        const gLast   = gliderHistory[gliderHistory.length - 1];

        for (const fd of flarmSleepData) {
            if (!fd.flarmData?.flarmId || fd.flarmData.flarmId === flarmId) continue;   // niet zichzelf vergelijken of als er geen flarmId is

            const sleepHistory = recentMoving(fd.flarmData.flarmId);
            if (sleepHistory.length === 0) {
                this.logger.debug(`No recent moving history for tow plane ${fd.flarmData.flarmId}, skipping.`);
                continue;
            }

            this.logger.debug(`Comparing glider ${flarmId} (speed: ${gSpeed.toFixed(1)} m/s, course: ${gCourse.toFixed(1)}°) with tow plane ${fd.flarmData.flarmId} (speed: ${avgSpeed(sleepHistory).toFixed(1)} m/s, course: ${avgCourse(sleepHistory).toFixed(1)}°)`);
            if (Math.abs(avgSpeed(sleepHistory) - gSpeed) > 15) {
                this.logger.debug(`Speed difference too large for tug ${fd.REG_CALL} (ID: ${fd.vliegtuigID})`);
                continue;
            }
            if (this.angleDiff(avgCourse(sleepHistory), gCourse) > 25) {
                this.logger.debug(`Course difference too large for tug ${fd.REG_CALL} (ID: ${fd.vliegtuigID})`);
                continue;
            }

            const tLast  = sleepHistory[sleepHistory.length - 1];
            const gLat   = gLast.kalman_latitude  ?? gLast.latitude;
            const gLon   = gLast.kalman_longitude ?? gLast.longitude;
            const tLat   = tLast.kalman_latitude  ?? tLast.latitude;
            const tLon   = tLast.kalman_longitude ?? tLast.longitude;

            const dist    = this.distanceMeters(gLat, gLon, tLat, tLon);
            this.logger.debug(`Checking tug ${fd.REG_CALL} (ID: ${fd.vliegtuigID}) for glider ${gLast.flarmId}: distance = ${dist.toFixed(1)} m`);
            if (dist < 40 || dist > 200) {
                this.logger.debug(`Distance to tug ${fd.REG_CALL} (ID: ${fd.vliegtuigID}) is ${dist.toFixed(1)} m, which is outside the acceptable range (40-200 m)`);
                continue;
            }

            return fd.vliegtuigID;
        }

        return -1;
    }

    // afstand in meters tussen twee lat/lon posities
    private distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R    = 6371000;
        const rlat1 = lat1 * Math.PI / 180;
        const rlat2 = lat2 * Math.PI / 180;
        const dlat  = (lat2 - lat1) * Math.PI / 180;
        const dlon  = (lon2 - lon1) * Math.PI / 180;
        const a     = Math.sin(dlat / 2) ** 2 + Math.cos(rlat1) * Math.cos(rlat2) * Math.sin(dlon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // hoek verschil
    private angleDiff(a: number, b: number): number {
        const d = Math.abs(a - b) % 360;
        return d > 180 ? 360 - d : d;
    }

    // Moet het vliegtuig aangemeld worden. Dat moet alleen als het vliegtuig nog niet aangemeld is en binnen de geo-polygon van het vliegveld aanwezig is
    checkAanmelden(payload: FlarmDataWithStatus)
    {
        if (!payload.vliegtuigID)
            return;

        const aangemeld = this.heliosInboundService.isAangemeld(payload.vliegtuigID);

        if (aangemeld)   // als het vliegtuig al aangemeld is, dan hoeven we niets te doen
            return;

        const isInside =  this.heliosInboundService.isInsidePolygon([payload.flarmData.longitude, payload.flarmData.latitude]);
        if (isInside) {
            const vliegveldID = this.heliosInboundService.getVliegveld() ? this.heliosInboundService.getVliegveld().ID : undefined;
            this.logger.log(`AANMELDEN ${payload.vliegtuigID}  ${payload.REG_CALL}`);
            this.eventEmitter.emit(GliderEvents.GliderAanmelden, payload.vliegtuigID, vliegveldID);
        }
    }

    // Zorg dat de juiste start gekoppeld is aan de flarm data
    @OnEvent(HeliosEvents.StartsGeladen)
    mapStartOnFlarm()
    {
        for (let i=0; i < this.FlarmDataStore.length; i++)
        {
            const nweStart = this.heliosInboundService.getStart( this.FlarmDataStore[i].vliegtuigID);

            if (!nweStart) {
                this.FlarmDataStore[i].startID = undefined;
                this.eventEmitter.emit(WebSocketEvents.PublishFlarm, this.FlarmDataStore[i]);
            }
            else if (nweStart.ID !== this.FlarmDataStore[i].startID) {
                this.FlarmDataStore[i].startID = nweStart.ID;
                this.eventEmitter.emit(WebSocketEvents.PublishFlarm, this.FlarmDataStore[i]);
            }
        }
    }

    // Als we 15 minuten geen flarm data ontvangen hebben, dan zijn we het vliegtuig kwijt. Opschonen flarm data en geschiedenis
    @OnEvent(FlarmEvents.LostFlarm)
    handleFlarmLostEvent(FlarmID: string) {
        this.logger.verbose("handleFlarmLostEvent ", FlarmID);

        const idx = this.FlarmDataStore.findIndex((fd) => fd?.flarmData?.flarmId === FlarmID);
        if (idx >= 0) {
            this.FlarmDataStore.splice(idx, 1);
        }
        this.positionHistory.delete(FlarmID);
    }

    // Stuur iedere 5 minuten alle data naar het websocket (frontend)
    @Cron(CronExpression.EVERY_5_MINUTES)
    @OnEvent(WebSocketEvents.OnConnect)
    stuurAlles() {
        this.logger.verbose("Stuur alles naar websocket");
        this.FlarmDataStore.forEach((fd) => {
            this.eventEmitter.emit(WebSocketEvents.PublishFlarm, fd);
        });
    }
}
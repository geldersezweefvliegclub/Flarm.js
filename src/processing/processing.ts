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
    private FlarmDataStore: FlarmDataWithStatus[] = [];
    private positionHistory: Map<string, FlarmData[]> = new Map();
    private readonly DelayedLandingIntervalId: NodeJS.Timeout;

    constructor(private readonly eventEmitter: EventEmitter2,
                private readonly loginservice: LoginService,
                private readonly heliosInboundService: HeliosInboundWorker,
                private readonly parsedLogger: ParsedLogger) {
        this.logger = new Logger(ProcessingService.name);
        this.DelayedLandingIntervalId = setInterval(() => this.delayedLanding(), 0.50 * 60*1000);
    }

    onModuleInit() {
        this.logger.log('ProcessingService has been initialized.');
        this.loginservice.login().then((succes) => {
            const str:string = succes ? 'success' : 'failed';
            this.logger.log((`Helios login ${str}`));
        });
    }

    onModuleDestroy() {
        this.logger.log('ProcessingService has been destroyed.');
        clearInterval(this.DelayedLandingIntervalId);
    }

    @OnEvent(FlarmEvents.DataReceived)
    handleDataReceivedEvent(payload: FlarmData) {
        const MIN_SPEED = 30;
        const CIRCUIT_HOOGTE = 220;
        const LANDINGS_HOOGTE = 50;

        // als het vliegtuig niet bekend is, dan doen we niets
        const vliegtuig = this.heliosInboundService.getVliegtuigByFlarmcode(payload.flarmId);
        if (vliegtuig === undefined) {
            return;
        }

        this.addToHistory(payload);

        const start = this.heliosInboundService.getStart(vliegtuig.ID);
        const fdContainer = new FlarmDataWithStatus(payload, vliegtuig, start);

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

        if (fdContainer.flarmData.kalman_speed !== undefined && fdContainer.flarmData.kalman_altitude_agl !== undefined)
        {
            if (idx < 0)
            {
                fdContainer.maxHoogte = fdContainer.flarmData.kalman_altitude_agl;
                if (fdContainer.flarmData.kalman_speed > MIN_SPEED && fdContainer.flarmData.kalman_altitude_agl > CIRCUIT_HOOGTE) {
                    // als het vliegtuig sneller dan 30 km/h vliegt en hoger dan XXX meter, dan is het vliegtuig aan het vliegen
                    fdContainer.status = GliderStatus.Flying;
                }
            }
            else
            {
                if ((fdContainer.flarmData.kalman_altitude_agl > previousUpdate.maxHoogte) || (previousUpdate.maxHoogte === undefined))
                    fdContainer.maxHoogte = fdContainer.flarmData.kalman_altitude_agl;

                // status moet via takeoff status gaan, dus niet in 1x van grond naar vliegen
                if (previousUpdate.status !== GliderStatus.On_Ground &&
                    fdContainer.flarmData.kalman_speed > MIN_SPEED   &&
                    fdContainer.flarmData.kalman_altitude_agl > CIRCUIT_HOOGTE)
                {
                    // als het vliegtuig sneller dan 30 km/h vliegt en hoger dan XXX meter, dan is het vliegtuig aan het vliegen
                    fdContainer.status = GliderStatus.Flying;
                }
                else if (fdContainer.flarmData.kalman_speed > MIN_SPEED &&
                    fdContainer.flarmData.kalman_altitude_agl <= CIRCUIT_HOOGTE &&
                    fdContainer.flarmData.kalman_altitude_agl > LANDINGS_HOOGTE &&
                    (previousUpdate.status == GliderStatus.Flying) || ((previousUpdate.status == GliderStatus.TakeOff) && fdContainer.flarmData.kalman_climb < 0))
                {
                    // als het vliegtuig sneller dan 30 km/h vliegt en lager dan XXX meter, dan is het vliegtuig in circuit
                    // Status takeoff is toegevoegd ivm kabelbreuk, dan kom je niet zo hoog, maar je moet dan niet meer stijgen
                    fdContainer.status = GliderStatus.Circuit;
                }
                else if (fdContainer.flarmData.kalman_speed > MIN_SPEED && fdContainer.flarmData.kalman_altitude_agl <= LANDINGS_HOOGTE &&
                    ((previousUpdate.status == GliderStatus.Flying) || (previousUpdate.status == GliderStatus.Circuit)))
                {
                    // als het vliegtuig sneller dan 30 km/h vliegt en lager dan XXX meter, dan is het vliegtuig aan het landen
                    fdContainer.status = GliderStatus.Landing;
                }
                else if (fdContainer.flarmData.kalman_speed > MIN_SPEED &&
                         fdContainer.flarmData.kalman_altitude_agl > LANDINGS_HOOGTE && (previousUpdate.status == GliderStatus.On_Ground))
                {
                    // als het vliegtuig sneller dan 30 km/h vliegt en hoger dan XXX meter, en op de grond stond, dan is het vliegtuig aan het opstijgen
                    fdContainer.status = GliderStatus.TakeOff;

                    fdContainer.starttijd = DateTime.now().toFormat('HH:mm');
                    fdContainer.landingstijd = "";

                    //const sleepIdx = fdContainer.SLEEPKIST === true ? -1 : this.zoekSleep(fdContainer.flarmData.flarmId, fdContainer.flarmData.kalman_speed, fdContainer.flarmData.kalman_altitude_agl, fdContainer.flarmData.course);
                    //const sleepKist = (sleepIdx < 0) ? undefined : this.FlarmDataStore[sleepIdx];

                    fdContainer.bijOnsGestart = this.heliosInboundService.isInsidePolygon([fdContainer.flarmData.longitude, fdContainer.flarmData.latitude]);

                    /*
                    // bepaal de startmethode
                    if (fdContainer.flarmData.kalman_climb > 10)            // climb rate > 10 m/s = lieren
                    {
                        fdContainer.startMethode = StartMethode.Lier;
                    }
                    else {
                        if (vliegtuig.ZELFSTART)
                        {
                            if (sleepKist)      // als het vliegtuig een zelfstarter is en er is een sleepvliegtuig gevonden, dan is het een toch sleepstart
                                fdContainer.startMethode = StartMethode.Sleep;
                            else // als het vliegtuig een zelfstarter is en er is geen sleepvliegtuig gevonden, dan is het een zelfstart
                                fdContainer.startMethode = StartMethode.Zelfstart;
                        }
                        else
                        {
                            // als het vliegtuig geen zelfstarter is, dan is het slepen
                            if (sleepKist)      // sleepvliegtui gevonden, dan is het een sleepstart
                            {
                                fdContainer.startMethode = StartMethode.Sleep;

                                // bij de sleepkist de gegevens invullen van het gesleepte vliegtuig
                                this.FlarmDataStore[sleepIdx].gesleeptStartID = fdContainer.startID;
                                this.FlarmDataStore[sleepIdx].gesleeptRegCall = vliegtuig.REG_CALL;
                            }
                            else
                            {
                                // maar zonder sleepvliegtuig is het toch een lierstart
                                fdContainer.startMethode = StartMethode.Lier;
                            }
                        }
                    }
                    */

                    if (start)
                    {
                        this.logger.log(`------- STARTING: ${vliegtuig.REG_CALL} ${start?.ID}`);
                        this.eventEmitter.emit(GliderEvents.GliderStart, start?.ID);

                        setTimeout(() => this.bepaalStartMethode(fdContainer), 30 * 1000);
                    }
                    else
                    {
                        this.logger.log(`------- STARTING: ${vliegtuig.REG_CALL} NO START`);
                        setTimeout(() => this.bepaalStartMethode(fdContainer), 30 * 1000);          // TODO, remove this line
                    }
                }
                else if (fdContainer.flarmData.kalman_speed <= MIN_SPEED &&
                         fdContainer.flarmData.kalman_altitude_agl <= LANDINGS_HOOGTE)
                {
                    // als snelheid constant is en lager dan 30 km/h en zonder hoogte, en bovendien op dezelfde hoogte blijft, dan staat hij stil
                    const staatStil = ((fdContainer.flarmData.kalman_speed == previousUpdate.flarmData.kalman_speed) &&
                                       Math.abs (fdContainer.flarmData.kalman_altitude_agl - previousUpdate.flarmData.kalman_altitude_agl) < 1)

                    if ((previousUpdate.status == GliderStatus.Circuit) ||
                        (previousUpdate.status == GliderStatus.Landing) || staatStil)
                    {
                        if ((previousUpdate.status == GliderStatus.Circuit) || (previousUpdate.status == GliderStatus.Landing)) {
                            fdContainer.landingstijd = DateTime.now().toFormat('HH:mm');
                            fdContainer.bijOnsGestart = false;

                            if (start)
                            {
                                this.logger.log(`------- LANDING: ${vliegtuig.REG_CALL} ${start?.ID}`);
                                this.eventEmitter.emit(GliderEvents.GliderLanded, start?.ID);
                            }
                            else
                            {
                                this.logger.log(`------- LANDING: ${vliegtuig.REG_CALL} NO START`);
                            }

                            // als het sleepvliegtuig geland is, dan hoogte invullen voor gesleept vliegtuig
                            if (vliegtuig.SLEEPKIST)
                            {
                                this.eventEmitter.emit(GliderEvents.SleepHoogte, fdContainer.maxHoogte);
                                fdContainer.maxHoogte = undefined;
                            }
                        }
                        this.checkAanmelden(fdContainer);
                    }
                    fdContainer.status = GliderStatus.On_Ground;
                }
                this.parsedLogger.record(fdContainer);
            }
        }
        this.eventEmitter.emit(WebSocketEvents.PublishFlarm, fdContainer);

        if (idx < 0)
            this.FlarmDataStore.push(fdContainer);
        else
            this.FlarmDataStore[idx] = fdContainer;

        this.logger.debug(`Ontvangen: ${fdContainer.flarmData?.flarmId} ${fdContainer.REG_CALL} start ID: ${fdContainer?.startID}  GS:${fdContainer?.flarmData?.speed}|${fdContainer?.flarmData?.kalman_speed} ALT:${fdContainer?.flarmData?.altitude_agl}|${fdContainer?.flarmData?.kalman_altitude_agl} ${fdContainer?.flarmData?.climbRate}|${fdContainer?.flarmData?.kalman_climb} ${GliderStatus[fdContainer.status]}`);
    }

    // Er is al een tijd geen update ontvangen van een vliegtuig. Als het vliegtuig op circuit of landing is, dan nemen we aan dat het vliegtuig geland is.
    // Dit kan gebeuren als er geen flarm updates meer binnenkomen van een vliegtuig als het vlak boven de grond is.
    // Oorzaak is meestal omdat flarm ontvangst niet meer mogelijk is doordat de ontvanger te ver weg is.
    delayedLanding() {
        const LANDINGS_HOOGTE = 50;

        const now = DateTime.now();``

        for (let i=0 ; i < this.FlarmDataStore.length; i++) {
            const fdContainer = this.FlarmDataStore[i];

            if (!fdContainer.flarmData) {
                this.logger.error(`Geen flarm data voor ${fdContainer.REG_CALL} ` + JSON.stringify(fdContainer));
                continue;
            }

            const diff = Interval.fromDateTimes(fdContainer.flarmData.receivedTime, now);

            if ((diff.length('minutes') >= 1) && (fdContainer.status === GliderStatus.Landing) || (fdContainer.status === GliderStatus.Circuit))
            {
                const sec = diff.length('seconds');
                const predictedAltitude = Math.round(fdContainer.flarmData.kalman_altitude_agl + (sec * fdContainer.flarmData.kalman_climb));

                this.logger.log(`Predicated altitude:  ${fdContainer.REG_CALL} start ID:${fdContainer.startID}  predicted:${predictedAltitude}`);

                if (predictedAltitude < LANDINGS_HOOGTE)
                {
                    if (fdContainer.startID) {
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

    private addToHistory(data: FlarmData): void {
        const flarmId = data.flarmId;
        const vliegtuig = this.heliosInboundService.getVliegtuigByFlarmcode(flarmId);
        const start = this.heliosInboundService.getStart(vliegtuig.ID);

        if (!this.positionHistory.has(flarmId)) {
            this.positionHistory.set(flarmId, []);
        }
        const history = this.positionHistory.get(flarmId);
        history.push(data);

        const cutoff = data.receivedTime.minus({ minutes: 3 });
        this.positionHistory.set(flarmId, history.filter(m => m.receivedTime > cutoff));
    }

    private bepaalStartMethode(data: FlarmDataWithStatus): void {
        const flarmId = data.flarmData.flarmId;
        const history = this.positionHistory.get(flarmId) ?? [];

        const vliegtuig = this.heliosInboundService.getVliegtuigByFlarmcode(flarmId);
        const takeoffWindow = history.filter(m => m.speed > 0);

        const maxClimb = takeoffWindow.length > 0
            ? Math.max(...takeoffWindow.map(m => m.kalman_climb ?? m.climbRate ?? 0))
            : 0;

        let sleepkistID = -1

        let startMethode: StartMethode;
        if (maxClimb > 10)
        {
            startMethode = StartMethode.Lier;
        }
        else
        {
            sleepkistID = this.zoekSleep(flarmId);

            if (sleepkistID > 0) {
                startMethode = StartMethode.Sleep;
            }
            else if (vliegtuig?.ZELFSTART) {
                startMethode = StartMethode.Zelfstart;
            }
            else {
                startMethode = StartMethode.Lier;
            }
        }

       this.logger.error(`StartMethode: ${vliegtuig?.REG_CALL} → ${StartMethode[startMethode]} (maxClimb: ${maxClimb.toFixed(1)} m/s, towPlane: ${sleepkistID})`);
       this.eventEmitter.emit(GliderEvents.StartMethodeDetermined, data.startID, startMethode, sleepkistID);
    }

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
        if (gliderHistory.length === 0) return -1;

        const gSpeed  = avgSpeed(gliderHistory);
        const gCourse = avgCourse(gliderHistory);
        const gLast   = gliderHistory[gliderHistory.length - 1];

        for (const fd of flarmSleepData) {
            if (!fd.flarmData?.flarmId || fd.flarmData.flarmId === flarmId) continue;   // niet zichzelf vergelijken of als er geen flarmId is

            const sleepHistory = recentMoving(fd.flarmData.flarmId);
            if (sleepHistory.length === 0) continue;

            if (Math.abs(avgSpeed(sleepHistory) - gSpeed) > 15) continue;
            if (this.angleDiff(avgCourse(sleepHistory), gCourse) > 25) continue;

            const tLast  = sleepHistory[sleepHistory.length - 1];
            const gLat   = gLast.kalman_latitude  ?? gLast.latitude;
            const gLon   = gLast.kalman_longitude ?? gLast.longitude;
            const tLat   = tLast.kalman_latitude  ?? tLast.latitude;
            const tLon   = tLast.kalman_longitude ?? tLast.longitude;

            const dist    = this.distanceMeters(gLat, gLon, tLat, tLon);
            if (dist < 40 || dist > 200) continue;

            // Tug should be ahead of glider: bearing from glider to tug ≈ course
            if (this.angleDiff(this.bearingDeg(gLat, gLon, tLat, tLon), gCourse) > 45) continue;

            return fd.vliegtuigID;
        }

        return -1;
    }

    private distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R    = 6371000;
        const rlat1 = lat1 * Math.PI / 180;
        const rlat2 = lat2 * Math.PI / 180;
        const dlat  = (lat2 - lat1) * Math.PI / 180;
        const dlon  = (lon2 - lon1) * Math.PI / 180;
        const a     = Math.sin(dlat / 2) ** 2 + Math.cos(rlat1) * Math.cos(rlat2) * Math.sin(dlon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const rlat1 = lat1 * Math.PI / 180;
        const rlat2 = lat2 * Math.PI / 180;
        const dlon  = (lon2 - lon1) * Math.PI / 180;
        const y     = Math.sin(dlon) * Math.cos(rlat2);
        const x     = Math.cos(rlat1) * Math.sin(rlat2) - Math.sin(rlat1) * Math.cos(rlat2) * Math.cos(dlon);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    private angleDiff(a: number, b: number): number {
        const d = Math.abs(a - b) % 360;
        return d > 180 ? 360 - d : d;
    }

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

    // Zorg dat de juiste start gekoppeld is aan flarm
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

    @OnEvent(FlarmEvents.LostFlarm)
    handleFlarmLostEvent(FlarmID: string) {
        this.logger.verbose("handleFlarmLostEvent ", FlarmID);

        const idx = this.FlarmDataStore.findIndex((fd) => fd?.flarmData?.flarmId === FlarmID);
        if (idx >= 0) {
            this.FlarmDataStore.splice(idx, 1);
        }
        this.positionHistory.delete(FlarmID);
    }

    @Cron(CronExpression.EVERY_5_MINUTES)
    @OnEvent(WebSocketEvents.OnConnect)
    stuurAlles() {
        this.logger.verbose("Stuur alles naar websocket");
        this.FlarmDataStore.forEach((fd) => {
            this.eventEmitter.emit(WebSocketEvents.PublishFlarm, fd);
        });
    }
}
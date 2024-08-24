import {Injectable, Logger, OnModuleDestroy, OnModuleInit} from "@nestjs/common";
import {EventEmitter2, OnEvent} from "@nestjs/event-emitter";
import {FlarmEvents} from "../../shared/FlarmEvents";
import {FlarmData} from "../../inbound/flarm-ogn/flarm-ogn.service";
import {LoginService} from "../../services/apiservice/login.service";
import {HeliosInboundService} from "../../inbound/helios/helios-inbound.service";
import {HeliosStartDataset, HeliosVliegtuigenDataset} from "../../types/Helios";
import {ConfigService} from "@nestjs/config";
import * as fs from "node:fs";
import {isInsidePolygon} from "../../utils/utils";
import {GliderEvents} from "../../shared/GliderEvents";
import {GliderStatus} from "../../shared/GliderStatus";
import {DateTime, Interval} from "luxon";

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
    vliegtuigID?: number
    startID?: number

    startMethode?: StartMethode;
    gesleeptStartID?: number;               // ID van de start van het zweefvliegtuig dat gesleept wordt
    gesleeptRegCall?: string;               // registratie van het zweefvliegtuig dat gesleept wordt
    maxHoogte?: number;                     // maximale hoogte van het sleepvliegtuig tijdens de vlucht

    constructor(fData: FlarmData, vliegtuig: HeliosVliegtuigenDataset, start: HeliosStartDataset) {
        this.flarmData = fData;
        this.REG_CALL = (vliegtuig) ? vliegtuig.REG_CALL : undefined;
        this.vliegtuigID = (vliegtuig) ? vliegtuig.ID : undefined;
        this.startID = (start) ? start.ID : undefined;
        this.status = GliderStatus.Unknown;
    }
}


@Injectable()
export class ProcessingService implements  OnModuleInit, OnModuleDestroy  {
    private readonly logger = new Logger(ProcessingService.name);
    private geoFence: string;
    private FlarmDataStore: FlarmDataWithStatus[] = [];
    private DelayedLandingIntervalId: NodeJS.Timeout;

    constructor(private readonly eventEmitter: EventEmitter2,
                private readonly loginservice: LoginService,
                private readonly configService: ConfigService,
                private readonly heliosInboundService: HeliosInboundService) {
        this.logger = new Logger(ProcessingService.name);
        this.DelayedLandingIntervalId = setInterval(() => this.delayedLanding(), 0.50 * 60*1000);
    }

    onModuleInit() {
        this.logger.log('ProcessingService has been initialized.');
        this.loginservice.login().then((succes) => {
            const str:string = succes ? 'success' : 'failed';
            this.logger.log((`Helios login ${str}`));
        });

        const fileGeoJSON = this.configService.get('Vliegveld.GeoJSON');

        if (fileGeoJSON) {
            if (fs.existsSync (fileGeoJSON)) {
                this.logger.log(`GeoJSON file found ${fileGeoJSON}`);
                const fileContents = fs.readFileSync(fileGeoJSON, 'utf8');
                try
                {
                    this.geoFence = JSON.parse(fileContents).features[0].geometry.coordinates[0];
                }
                catch (e) {
                    this.logger.error(`Error parsing GeoJSON file ${fileGeoJSON}`);
                }
            }
        }
    }

    onModuleDestroy() {
        this.logger.log('ProcessingService has been destroyed.');
        clearInterval(this.DelayedLandingIntervalId);
    }

    @OnEvent(FlarmEvents.DataReceived)
    handleDataReceivedEvent(payload: FlarmData) {
        const MIN_SPEED = 30;
        const CIRCUIT_HOOGTE = 200;
        const LANDINGS_HOOGTE = 50;

        // als het vliegtuig niet bekend is, dan doen we niets
        const vliegtuig = this.heliosInboundService.getVliegtuigByFlarmcode(payload.flarmId);
        if (vliegtuig === undefined) {
            return;
        }
        const start = this.heliosInboundService.getStart(vliegtuig.ID);
        const fdContainer = new FlarmDataWithStatus(payload, vliegtuig, start);

        const idx = this.FlarmDataStore.findIndex((fd) => fd.flarmData.flarmId === fdContainer.flarmData.flarmId);
        const previousUpdate: FlarmDataWithStatus =  this.FlarmDataStore[idx];

        // overnemen van de status en tijden van het vorige bericht
        if (idx >= 0)
        {
            fdContainer.status = previousUpdate.status;
            fdContainer.starttijd = previousUpdate.starttijd;
            fdContainer.maxHoogte = previousUpdate.maxHoogte;
            fdContainer.landingstijd = previousUpdate.landingstijd;
            fdContainer.startMethode = previousUpdate.startMethode;
            fdContainer.gesleeptStartID = previousUpdate.gesleeptStartID;
        }

        if (fdContainer.flarmData.kalman_speed !== undefined && fdContainer.flarmData.kalman_altitude_agl !== undefined)
        {
            if (idx < 0)
            {
                fdContainer.maxHoogte = fdContainer.flarmData.kalman_altitude_agl;
            }
            else if ((fdContainer.flarmData.kalman_altitude_agl > previousUpdate.maxHoogte) || (previousUpdate.maxHoogte === undefined))
                fdContainer.maxHoogte = fdContainer.flarmData.kalman_altitude_agl;

            if (fdContainer.flarmData.kalman_speed > MIN_SPEED && fdContainer.flarmData.kalman_altitude_agl > CIRCUIT_HOOGTE)
            {
                // als het vliegtuig sneller dan 30 km/h vliegt en hoger dan XXX meter, dan is het vliegtuig aan het vliegen
                fdContainer.status = GliderStatus.Flying;
            }
            else if (idx >= 0)
            {
                if (fdContainer.flarmData.kalman_speed > MIN_SPEED &&
                    fdContainer.flarmData.kalman_altitude_agl <= CIRCUIT_HOOGTE &&
                    fdContainer.flarmData.kalman_altitude_agl > LANDINGS_HOOGTE &&
                    (previousUpdate.status == GliderStatus.Flying) || (previousUpdate.status == GliderStatus.TakeOff))
                {
                    // als het vliegtuig sneller dan 30 km/h vliegt en lager dan XXX meter, dan is het vliegtuig in circuit
                    // Status takeoff is toegevoegd ivm kabelbreuk, dan kom je niet zo hoog
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

                    const sleepIdx = this.zoekSleep(fdContainer.flarmData.flarmId, fdContainer.flarmData.kalman_speed, fdContainer.flarmData.kalman_altitude_agl, fdContainer.flarmData.course);
                    const sleepFlarm = (sleepIdx < 0) ? undefined : this.FlarmDataStore[sleepIdx];

                    // bepaal de startmethode
                    if (fdContainer.flarmData.kalman_climb > 10)            // climb rate > 10 m/s = lieren
                    {
                        fdContainer.startMethode = StartMethode.Lier;
                    }
                    else {
                        if (vliegtuig.ZELFSTART)
                        {
                            if (sleepFlarm)
                            {
                                // als het vliegtuig een zelfstarter is en er is een sleepvliegtuig gevonden, dan is het een sleepstart
                                fdContainer.startMethode = StartMethode.Sleep;
                            }
                            else
                            {
                                // als het vliegtuig een zelfstarter is en er is geen sleepvliegtuig gevonden, dan is het een zelfstart
                                fdContainer.startMethode = StartMethode.Zelfstart;
                            }
                        }
                        else
                        {
                            // als het vliegtuig geen zelfstarter is, dan is het slepen
                            if (sleepFlarm)
                            {
                                fdContainer.startMethode = StartMethode.Sleep;
                                this.FlarmDataStore[sleepIdx].gesleeptStartID = sleepFlarm.startID;
                                this.FlarmDataStore[sleepIdx].gesleeptRegCall = vliegtuig.REG_CALL;
                            }
                            else
                            {
                                // maar zonder sleepvliegtuig is het toch een lierstart
                                fdContainer.startMethode = StartMethode.Lier;
                            }
                        }
                    }

                    if (start)
                    {
                        this.logger.log(`------- STARTING: ${vliegtuig.REG_CALL} ${start?.ID}`);
                        this.eventEmitter.emit(GliderEvents.GliderStart, start?.ID, fdContainer.startMethode, sleepFlarm?.vliegtuigID);
                    }
                    else
                    {
                        this.logger.log(`------- STARTING: ${vliegtuig.REG_CALL} NO START`);
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
                                this.eventEmitter.emit(GliderEvents.SleepHoogte, fdContainer.gesleeptStartID, fdContainer.maxHoogte);
                                fdContainer.gesleeptStartID = undefined;
                                fdContainer.gesleeptRegCall = undefined;
                                fdContainer.maxHoogte = undefined;
                            }
                        }
                        fdContainer.status = GliderStatus.On_Ground;
                    }
                }
            }
        }

        if (idx < 0)
            this.FlarmDataStore.push(fdContainer);
        else
            this.FlarmDataStore[idx] = fdContainer;

        this.logger.log(`Ontvangen: ${fdContainer.flarmData?.flarmId} ${fdContainer.REG_CALL} start ID: ${fdContainer?.startID}  GS:${fdContainer?.flarmData?.speed}|${fdContainer?.flarmData?.kalman_speed} ALT:${fdContainer?.flarmData?.altitude_agl}|${fdContainer?.flarmData?.kalman_altitude_agl} ${fdContainer?.flarmData?.climbRate}|${fdContainer?.flarmData?.kalman_climb} ${GliderStatus[fdContainer.status]}`);
    }

    // Er is al een tijd geen update ontvangen van een vliegtuig. Als het vliegtuig op circuit of landing is, dan nemen we aan dat het vliegtuig geland is.
    // Dit kan gebeuren als er geen flarm updates meer binnenkomen van een vliegtuig als het vlak boven de grond is.
    // Oorzaak is meestal omdat flarm ontvangst niet meer mogelijk is doordat de ontvanger te ver weg is.
    delayedLanding() {
        const LANDINGS_HOOGTE = 50;

        const now = DateTime.now();``

        for (var i=0 ; i < this.FlarmDataStore.length; i++) {
            const fdContainer = this.FlarmDataStore[i];
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

    zoekSleep(flarmID: string, speed: number, altitude: number, course: number): number {
        const idx = this.FlarmDataStore.findIndex((fd) => {
            const diffSpeed = Math.abs(fd.flarmData.kalman_speed - speed);
            const diffAltitude = Math.abs(fd.flarmData.kalman_altitude_agl - altitude);
            const diffCourse = Math.abs(fd.flarmData.course - course);

            return flarmID !== fd.flarmData.flarmId && diffSpeed < 10 && diffAltitude < 20 && diffCourse < 30;
        });
        return idx;
    }

    @OnEvent(FlarmEvents.NewFlarm)
    handleNewFlarmEvent(payload: FlarmData){
        const VLIEG_HOOGTE = 50;

        this.logger.log("handleNewFlarmEvent ", JSON.stringify(payload));
        const vliegtuig:HeliosVliegtuigenDataset = this.heliosInboundService.getVliegtuigByFlarmcode(payload.flarmId)

        if (vliegtuig) {
           // this.logger.log("Vliegtuig gevonden ", JSON.stringify(vliegtuig));

            const vliegveldID: number| undefined = this.heliosInboundService.getVliegveld() ? this.heliosInboundService.getVliegveld().ID : undefined;

            // om geen vliegtuigen aan te melden die over vliegen, moet de hoogte en snelheid gecontroleerd worden
            if (VLIEG_HOOGTE< payload.kalman_altitude_agl && payload.kalman_speed > 30)
                return;

            if (this.geoFence) {
                // check if the flarm is inside the geoFence
                // if not, ignore the flarm
                // if so, send the flarm to the helios service
                const isInside =  isInsidePolygon([payload.longitude, payload.latitude], this.geoFence);
                if (isInside) {
                    this.logger.log(`AANMELDEN ${vliegtuig.REG_CALL}`);
                    this.eventEmitter.emit(GliderEvents.GliderAanmelden, vliegtuig.ID, vliegveldID);
                }
            }
            else
            {
                this.logger.log(`AANMELDEN ${vliegtuig.ID}`);
                this.eventEmitter.emit(GliderEvents.GliderAanmelden, vliegtuig.ID, vliegveldID);
            }
        }
    }

    @OnEvent(FlarmEvents.LostFlarm)
    handleFlarmLostEvent(FlarmID: string) {
        this.logger.log("handleFlarmLostEvent ", FlarmID);

        if (this.FlarmDataStore[FlarmID]) {
            delete this.FlarmDataStore[FlarmID];
        }
    }
}
import {Injectable, Logger, OnModuleInit} from '@nestjs/common';
import {HeliosStartDataset, HeliosType, HeliosVliegtuigenDataset} from "../types/Helios";
import {StartsService} from "./apiservice/starts.service";
import {VliegtuigenService} from "./apiservice/vliegtuigen.service";
import {TypesService} from "./apiservice/types.service";
import {LoginService} from "./apiservice/login.service";
import {ConfigService} from "@nestjs/config";
import {DateTime} from "luxon";
import {EventEmitter2, OnEvent} from "@nestjs/event-emitter";
import {HeliosEvents} from "../shared/HeliosEvents";
import * as fs from 'fs'
import {DaginfoService} from "./apiservice/daginfo";
import {AanwezigVliegtuigService} from "./apiservice/aanwezig-vliegtuig.service";
import {MQTT_STARTLIJST, HeliosMqttEvent} from "../mqtt/mqtt.events";
import {Cron} from "@nestjs/schedule";

@Injectable()
export class HeliosInboundWorker implements OnModuleInit {
    private readonly logger = new Logger(HeliosInboundWorker.name);

    public startsStore: HeliosStartDataset[] = [];
    public vliegtuigenStore: HeliosVliegtuigenDataset[] = [];
    public vliegveld: HeliosType = undefined;

    private geoFence: any = undefined;

    constructor(private readonly configService: ConfigService,
                private readonly typesService: TypesService,
                private readonly startsService: StartsService,
                private readonly loginservice: LoginService,
                private readonly eventEmitter: EventEmitter2,
                private readonly dagInfoService: DaginfoService,
                private readonly vliegtuigenService: VliegtuigenService,
                private readonly aanwezigVliegtuigService: AanwezigVliegtuigService) {
    }

    onModuleInit() {
        this.logger.log('HeliosInboundWorker has been initialized.');

        setTimeout(() => {
            this.loadVliegtuigen();
            this.loadVliegveld();
        }, 5 * 1000);

        setTimeout(() => {
            this.loadStarts();
            this.loadAanwezig();
        }, 10 * 1000);
    }

    // Iedere 10 minuten het bearer token vernieuwen, zodat we niet uitgelogd worden door Helios.
    @Cron('0 */10 * * * *')
    keepHeliosAlive(): void {
        this.loginservice.relogin();
    }

    // Ophalen van de lijst van vliegtuigen die op dit moment aanwezig zijn op het vliegveld
    @Cron('0 */5 9-21 * * *')
    loadAanwezig(): void {
        this.aanwezigVliegtuigService.getAanwezig();
    }

    // Er is een start aangepast / ingevoerd, via MQTT krijgen we dit in real-time door. Update de interne cache
    @OnEvent(MQTT_STARTLIJST)
    onStartlijstUpdated(_event: HeliosMqttEvent): void {
        const updatedStart = _event.resultaat as unknown as HeliosStartDataset;

        if (updatedStart === undefined || updatedStart === null)    // bevat geen data
            return;

        if (this.vliegveld === undefined)  // Flarm werkt per vliegveld, configuratie is nog niet geladen
            return;

        if (updatedStart.VELD_ID !== this.vliegveld.ID)  // De start is op een ander vliegveld
            return;

        if (updatedStart.DATUM !== DateTime.now().toISODate())
            return;

        const idx = this.startsStore.findIndex((s) => s.ID === _event.recordId);

        if (idx >= 0) {
            this.startsStore[idx] = updatedStart;       // start bestaat al, update
        } else {
            this.startsStore.push(updatedStart);        // start bestaat nog niet, toevoegen
        }

        // Laat weten dat de starts zijn bijgewerkt, zodat andere services (zoals Flarm) hun interne cache kunnen bijwerken
        this.eventEmitter.emit(HeliosEvents.StartsGeladen);
    }

    // Iedere 5 minuten halen we de starts op, fallback als we een MQTT event gemist hebben.
    // We halen alleen starts op van vandaag, en alleen starts die nog niet geland zijn.
    @Cron('0 */5 9-21 * * *')
    loadStarts(): void {
        this.logger.verbose('StartsService: loadStarts');
        if (this.vliegveld === undefined) {
            this.logger.error('Configuratie error: vliegveld is onbekend');
            return;
        }

        const datum = DateTime.now().toISODate();
        this.startsService.getStarts( false, null, { BEGIN_DATUM: datum, EIND_DATUM: datum }).then((starts) => {
            var startlijst:HeliosStartDataset[] = [];
            starts.forEach((start) => {     // ophalen start van vandaag
                if (start.VELD_ID === this.vliegveld.ID) {          // alleen starts van dit veld
                    if (start.LANDINGSTIJD === null) {              // nog niet geland
                        startlijst.push(start);
                    }
                }
            });
            this.startsStore = startlijst;
            this.eventEmitter.emit(HeliosEvents.StartsGeladen);
        });
    }

    // 1x per uut ophalen van alle vliegtuigen die we in helios kennen,
    // alleen vliegtuigen met een flarmcode zijn interessant, want alleen die kunnen we volgen via Flarm.
    @Cron('0 0 9-21 * * *')
    loadVliegtuigen() {
        this.logger.verbose('VliegtuigenService: loadVliegtuigen');
        this.vliegtuigenService.getVliegtuigen().then((vliegtuigen) => {
            if (vliegtuigen === undefined) {
                this.vliegtuigenStore = [];
            }
            else {
                vliegtuigen.forEach((vliegtuig) => {
                    if (vliegtuig.FLARMCODE)                        // alleen vliegtuigen met flarmcode zijn interessant
                        this.vliegtuigenStore.push(vliegtuig);
                });
            }
        });
    }

    // 1x per uur halen we het vliegveld op, zodat we weten welk vliegveld we volgen.
    // Dit is nodig voor het ophalen van starts en daginfo.
    @Cron('0 0 9-21 * * *')
    loadVliegveld() {
        const vliegveldCode = this.configService.get('Vliegveld.code');

        this.logger.verbose('StartsService: loadVliegveld');
        this.typesService.getTypes({['GROEP']: 9 }).then((t) => {
            this.vliegveld = t.find((type) => type.CODE.toLowerCase() === vliegveldCode.toLowerCase());
            this.loadGeoFence();
        });
    }


    // interne functie om vliegeveld op te halen
    public getVliegveld(): HeliosType {
        return this.vliegveld;
    }

    // zoek een vliegtuig op basis van de flarmcode, ongeacht hoofdletters of kleine letters
    public getVliegtuigByFlarmcode(flarmcode: string): HeliosVliegtuigenDataset {
        return this.vliegtuigenStore.find((vliegtuig) => vliegtuig.FLARMCODE.toLowerCase().includes(flarmcode.toLowerCase()));
    }

    // welke sleepvliegtuigen kennen we
    public getSleepkisten(): HeliosVliegtuigenDataset[] {
        return this.vliegtuigenStore.filter(vliegtuig => vliegtuig.SLEEPKIST === true);
    }

    // de meest recent start op van een gegeven vliegtuig
    public getStart(vliegtuigID: number): HeliosStartDataset {
        const starts : HeliosStartDataset[] = this.startsStore.filter((start) => start.VLIEGTUIG_ID === vliegtuigID).sort(
            (a, b) =>
            {
                if (a.STARTTIJD === null) {
                    return 1;
                }
                if (b.STARTTIJD === null) {
                    return -1;
                }
                return a.ID - b.ID;
            });

        return (starts.length > 0) ? starts[0] : null;
    }

    // start op basis van database ID
    public getStartByID(startID: number): HeliosStartDataset {
        return this.startsStore.find((start) => start.ID === startID);
    }

    // Zoek de start van het zweefvliegtuig dat op dit moment gesleept wordt door een sleepvliegtuig.
    // Wordt gebruikt als het sleepvliegtuig geland is: we willen dan weten voor welke start (welk zweefvliegtuig)
    // we de bereikte sleephoogte (SLEEP_HOOGTE) moeten opslaan.
    //
    // SLEEPKIST_ID staat op de start van het zweefvliegtuig en verwijst naar het vliegtuig-ID van de sleepkist
    // (dit veld wordt normaal door de toren ingevuld bij het inplannen van de start, en indien nodig
    // automatisch gecorrigeerd zodra Flarm het sleepvliegtuig heeft herkend, zie helios-outbound-worker.ts).
    //
    // Een start komt alleen in aanmerking als:
    //  - SLEEPKIST_ID overeenkomt met het sleepvliegtuig dat nu landt
    //  - STARTTIJD gevuld is (het zweefvliegtuig is echt gestart)
    //  - LANDINGSTIJD nog leeg is (het zweefvliegtuig is nog in de lucht; het sleepvliegtuig landt immers
    //    eerder dan het zweefvliegtuig dat het net gesleept is
    //
    // Zijn er (bij een dataprobleem) toch meerdere kandidaten, dan kiezen we de laatst gestarte
    // (laatste STARTTIJD, bij gelijke tijd het hoogste start-ID).
    public getStartBySleepkistID(sleepkistVliegtuigID: number): HeliosStartDataset {
        const starts : HeliosStartDataset[] = this.startsStore.filter((start) =>
            start.SLEEPKIST_ID === sleepkistVliegtuigID && !!start.STARTTIJD &&  !start.LANDINGSTIJD
        ).sort(
            (a, b) =>
            {
                if (a.STARTTIJD !== b.STARTTIJD) {
                    return b.STARTTIJD.localeCompare(a.STARTTIJD);
                }
                return b.ID - a.ID;
            });

        return (starts.length > 0) ? starts[0] : null;
    }

    // ophalen van de banengeometrie van het vliegveld,
    // zodat we kunnen bepalen of een vliegtuig binnen of buiten het vliegveld vliegt.
    @Cron('0 */10 * * * *')
    loadGeoFence() {
        if (this.configService.get('Vliegveld.Banen') === undefined)
        {
            this.geoFence = undefined;
            return
        }

        this.dagInfoService.getDagInfo().then((di) => {
            const banen = this.configService.get('Vliegveld.Banen');

            if (!di) {                                                              // daginfo niet beschikbaar
                this.geoFence = [[0.000, 0.000], [0.001,0.001], [0.002,0.002]];     //hier vliegt niemand, dus geen flarm verwerken
            }
            else if (this.vliegveld)
            {
                var baanCode = undefined;
                if (di.VELD_ID === this.vliegveld.ID) {
                    baanCode = di.BAAN_CODE;
                }
                else if (di.VELD_ID2 === this.vliegveld.ID) {
                    baanCode = di.BAAN_CODE2;
                }
            }

            this.logger.verbose(`Baan code ${baanCode}`);
            const bObj = banen.find((baan) => baan.code === baanCode);

            if (bObj) {
                const fileGeoJSON = bObj.GeoJSON
                try
                {
                    const fileContents = fs.readFileSync(fileGeoJSON, 'utf8');
                    this.geoFence = JSON.parse(fileContents).features[0].geometry.coordinates[0];
                    this.logger.log(`GeoJSON file found ${fileGeoJSON}`);
                }
                catch (e) {
                    this.logger.error(`Error parsing GeoJSON file ${fileGeoJSON}`);
                }
            }
        });
    }

    // is de flarm positie van het vliegtuig binnen de banengeometrie van het vliegveld? (true = binnen, false = buiten)
    isInsidePolygon(point) {
        // ray-casting algorithm based on
        // https://wrf.ecse.rpi.edu/Research/Short_Notes/pnpoly.html

        var x = point[0], y = point[1];

        if (this.geoFence === undefined || this.geoFence.length == 0)
            return true;

        var inside = false;
        for (var i = 0, j = this.geoFence.length - 1; i < this.geoFence.length; j = i++) {
            var xi = this.geoFence[i][0], yi = this.geoFence[i][1];
            var xj = this.geoFence[j][0], yj = this.geoFence[j][1];

            var intersect = ((yi > y) != (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }

        return inside;
    };

    // is het vliegtuig reeds aangemeld?
    isAangemeld(vliegtuigID: number): boolean {
        return this.aanwezigVliegtuigService.isAangemeld(vliegtuigID);
    }
}
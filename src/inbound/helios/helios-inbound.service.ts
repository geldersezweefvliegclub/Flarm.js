import {Injectable, Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {HeliosStartDataset, HeliosType, HeliosVliegtuigenDataset} from "../../types/Helios";
import {StartsService} from "../../services/apiservice/starts.service";
import {VliegtuigenService} from "../../services/apiservice/vliegtuigen.service";
import {TypesService} from "../../services/apiservice/types.service";
import {LoginService} from "../../services/apiservice/login.service";
import {ConfigService} from "@nestjs/config";
import {DateTime} from "luxon";
import {GliderStatus} from "../../shared/GliderStatus";
import {EventEmitter2, OnEvent} from "@nestjs/event-emitter";
import {GliderEvents} from "../../shared/GliderEvents";
import {HeliosEvents} from "../../shared/HeliosEvents";
import * as fs from 'fs'
import {DaginfoService} from "../../services/apiservice/daginfo";
import {AanwezigVliegtuigService} from "../../services/apiservice/aanwezig-vliegtuig.service";

@Injectable()
export class HeliosInboundService implements  OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(HeliosInboundService.name);

    public startsStore: HeliosStartDataset[] = [];
    public vliegtuigenStore: HeliosVliegtuigenDataset[] = [];
    public vliegveld: HeliosType = undefined;

    private geoFence: any = undefined;
    private loadVliegtuigenIntervalId: NodeJS.Timeout;
    private loadStartsIntervalId : NodeJS.Timeout;
    private loadAanwezigIntervalId : NodeJS.Timeout;
    private loadVliegveldIntervalId : NodeJS.Timeout;
    private loadGeoFenceIntervalId: NodeJS.Timeout;
    private keepHeliosAliveIntervalId : NodeJS.Timeout;

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
        this.logger.log('HeliosInboundService has been initialized.');

        this.loadStartsIntervalId = setInterval(() => this.loadStarts(), 1 * 60 * 1000);
        this.loadAanwezigIntervalId = setInterval(() => this.aanwezigVliegtuigService.getAanwezig(), 5 * 60 * 1000);    // welke vliegtuigen zijn aanwezig

        this.keepHeliosAliveIntervalId = setInterval(() => this.loginservice.relogin(), 10 * 60 * 1000); // bijft ingelogd
        this.loadGeoFenceIntervalId = setInterval(() => this.loadGeoFence(), 10 * 60*1000);   // iedere 5 minuten ophalen op welke baan we zitten

        this.loadVliegveldIntervalId = setInterval(() => this.loadVliegveld(), 60 * 60 * 1000);
        this.loadVliegtuigenIntervalId = setInterval(() => this.loadVliegtuigen(), 60 * 60 * 1000);

        // eerst vliegtuigen en vliegveld laden
        setTimeout(() => {
            this.loadVliegtuigen();
            this.loadVliegveld();
        }, 5 *  1000); // 5 seconden wachten met laden

        // dan starts laden
        setTimeout(() => {
            this.loadStarts();
        }, 10 *  1000); // 5 seconden wachten met laden
    }

    onModuleDestroy() {
        this.logger.log('VliegtuigenService has been destroyed.');
        clearInterval(this.loadStartsIntervalId);
        clearInterval(this.loadVliegtuigenIntervalId);
        clearInterval(this.loadVliegveldIntervalId);
        clearInterval(this.keepHeliosAliveIntervalId);
        clearInterval(this.loadGeoFenceIntervalId);
    }

    @OnEvent(HeliosEvents.OnLandedRecorded)
    @OnEvent(HeliosEvents.OnStartRecorded)
    loadStarts(): void {
        this.logger.log('StartsService: loadStarts');
        if (this.vliegveld === undefined) {
            console.error('Confiuratie error: vliegveld is onbekend');
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

    // vliegtuigen ophalen uit Helios
    loadVliegtuigen() {
        this.logger.log('VliegtuigenService: loadVliegtuigen');
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

    // vliegveld ophalen uit Helios, alleen vliegveld voor flarm is interessant
    // we vinden zo het vliegveld ID op basis van de code in de configuratie
    loadVliegveld() {
        const vliegveldCode = this.configService.get('Vliegveld.code');

        this.logger.log('StartsService: loadStarts');
        this.typesService.getTypes({['GROEP']: 9 }).then((t) => {
            this.vliegveld = t.find((type) => type.CODE.toLowerCase() === vliegveldCode.toLowerCase());
            this.loadGeoFence();
        });
    }

    public getVliegveld(): HeliosType {
        return this.vliegveld;
    }

    public getVliegtuigByFlarmcode(flarmcode: string): HeliosVliegtuigenDataset {
        return this.vliegtuigenStore.find((vliegtuig) => vliegtuig.FLARMCODE.toLowerCase() === flarmcode.toLowerCase());
    }

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

    public getStartByID(startID: number): HeliosStartDataset {
        return this.startsStore.find((start) => start.ID === startID);
    }


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

            this.logger.log(`Baan code ${baanCode}`);
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

    isAangemeld(vliegtuigID: number): boolean {
        return this.aanwezigVliegtuigService.isAangemeld(vliegtuigID);
    }
}
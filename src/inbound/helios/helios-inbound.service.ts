import {Injectable, Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {HeliosStartDataset, HeliosType, HeliosVliegtuigenDataset} from "../../types/Helios";
import {StartsService} from "../../services/apiservice/starts.service";
import {VliegtuigenService} from "../../services/apiservice/vliegtuigen.service";
import {TypesService} from "../../services/apiservice/types.service";
import {LoginService} from "../../services/apiservice/login.service";
import {ConfigService} from "@nestjs/config";
import {DateTime} from "luxon";

@Injectable()
export class HeliosInboundService implements  OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(HeliosInboundService.name);

    public startsStore: HeliosStartDataset[] = [];
    public vliegtuigenStore: HeliosVliegtuigenDataset[] = [];
    public vliegveld: HeliosType = undefined;

    private loadVliegtuigenIntervalId: NodeJS.Timeout;
    private loadStartsIntervalId : NodeJS.Timeout;
    private loadVliegveldIntervalId : NodeJS.Timeout;
    private keepHeliosAliveIntervalId : NodeJS.Timeout;

    constructor(private readonly configService: ConfigService,
                private readonly  typesService: TypesService,
                private readonly  startsService: StartsService,
                private readonly  loginservice: LoginService,
                private readonly  vliegtuigenService: VliegtuigenService) {
    }

    onModuleInit() {
        this.logger.log('HeliosInboundService has been initialized.');

        this.loadStartsIntervalId = setInterval(() => this.loadStarts(), 1 * 60 * 1000);
        this.loadVliegveldIntervalId = setInterval(() => this.loadVliegveld(), 1 * 60 * 1000);
        this.loadVliegtuigenIntervalId = setInterval(() => this.loadVliegtuigen(), 60 * 60 * 1000);
        this.keepHeliosAliveIntervalId = setInterval(() => this.loginservice.relogin(), 10 * 60 * 1000); // bijft ingelogd

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
    }

    loadStarts() {
        this.logger.log('StartsService: loadStarts');
        if (this.vliegveld === undefined) {
            console.error('Confiuratie error: vliegveld is onbekend');
            return;
        }

        this.startsService.getStarts().then((starts) => {
            var startlijst:HeliosStartDataset[] = [];
            starts.forEach((start) => {     // ophalen start van vandaag
                if (start.VELD_ID === this.vliegveld.ID) {          // alleen starts van dit veld
                    if (start.LANDINGSTIJD === null) {              // nog niet geland
                        startlijst.push(start);
                    } else {
                        const now = DateTime.now();
                        const landingstijd = parseInt(start.LANDINGSTIJD.split(':')[0]) * 60 + parseInt(start.LANDINGSTIJD.split(':')[1]);

                        // landing is minder dan 15 minuten gelden
                        if (((now.hour * 60 + now.minute) - landingstijd) < 15)
                            startlijst.push(start);
                    }
                }
            });
            this.startsStore = startlijst;
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
        });
    }

    public getVliegveld(): HeliosType {
        return this.vliegveld;
    }

    public getVliegtuigByFlarmcode(flarmcode: string): HeliosVliegtuigenDataset {
        return this.vliegtuigenStore.find((vliegtuig) => vliegtuig.FLARMCODE.toLowerCase() === flarmcode.toLowerCase());
    }

    public getStart(vliegtuigID: number): HeliosStartDataset {
        const starts : HeliosStartDataset[] = this.startsStore.filter((start) => start.VLIEGTUIG_ID === vliegtuigID);

        // er zijn geen starts
        if (starts.length  === 0) {
            return null;
        }

        // er is maar 1 start, dus eenvoudig
        if (starts.length == 1) {
            return starts[0];
        }

        // eersta start die nog niet geland is
        const start:HeliosStartDataset = this.startsStore.find((start) => start.VLIEGTUIG_ID === vliegtuigID && start.LANDINGSTIJD === null);

        // er is een start die nog niet geland is
        if (start) {
            return start;
        }

        // er zijn meerdere starts, maar zijn allemaal geland, kies de laatste
        return starts[starts.length - 1];
    }
}
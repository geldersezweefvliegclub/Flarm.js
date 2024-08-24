import {Injectable, Logger, OnModuleInit} from '@nestjs/common';
import {OnEvent} from "@nestjs/event-emitter";
import {GliderEvents} from "../../shared/GliderEvents";
import {StartMethode} from "../../processing/processing/processing";
import {StartsService} from "../../services/apiservice/starts.service";
import {AanwezigVliegtuigService} from "../../services/apiservice/aanwezig-vliegtuig.service";
import {HeliosStart} from "../../types/Helios";
import {DateTime} from "luxon";

@Injectable()
export class HeliosOutboundService implements OnModuleInit {
    private readonly logger = new Logger(HeliosOutboundService.name);

    constructor(private readonly  startsService: StartsService,
                private readonly aanwezigVliegtuigService: AanwezigVliegtuigService) {
        this.logger.log('HeliosOutboundService outbound started');
    }

    onModuleInit(): any {
        this.logger.log('HeliosOutboundService outbound initialized');
    }

    @OnEvent(GliderEvents.GliderStart)
    handleStartReceivedEvent(startID:number, startMethode: StartMethode, sleepKistID: number){

        this.startsService.getStart(startID).then((start: HeliosStart) => {
            if((start.STARTTIJD !== undefined) && (start.LANDINGSTIJD !== null))
            {
                this.logger.log('Starttijd al aanwezig in Helios');
            }
            else
            {
                this.logger.log('Starttijd wordt opgeslagen in Helios');

                const s: HeliosStart =
                {
                    ID: startID,
                    STARTTIJD: DateTime.now().toFormat('HH:mm'),
                    SLEEPKIST_ID: sleepKistID,
                    OPMERKINGEN: (startMethode !== start.STARTMETHODE_ID) ? `Controleer startmethode, lijkt ${StartMethode[startMethode]} te zijn` : start.OPMERKINGEN
                }
                this.startsService.updateStart(s);
            }
        })
    }

    @OnEvent(GliderEvents.GliderLanded)
    handleLandedReceivedEvent(startID:number){
        this.startsService.getStart(startID).then((start: HeliosStart) => {

            if ((start.LANDINGSTIJD !== undefined) && (start.LANDINGSTIJD !== null))
            {
                this.logger.log('Landingstijd al aanwezig Helios');
            }
            else
            {
                this.logger.log('Landingstijd wordt opgeslagen in Helios');

                const s: HeliosStart = {
                    ID: startID,
                    LANDINGSTIJD: DateTime.now().toFormat('HH:mm'),
                }
                this.startsService.updateStart(s);
            }
        })
    }

    @OnEvent(GliderEvents.SleepHoogte)
    handleUpdateSleepHoogteReceivedEvent(startID: number, hoogte: number){
        const s: HeliosStart = {
            ID: startID,
            SLEEP_HOOGTE: hoogte
        }
        this.startsService.updateStart(s);
    }

    @OnEvent(GliderEvents.GliderAanmelden)
    handleGliderAanmeldenReceivedEvent(vliegtuigID: number, vliegveldID:number){
        this.aanwezigVliegtuigService.aanmelden(DateTime.now(), vliegtuigID, vliegveldID);
    }
}

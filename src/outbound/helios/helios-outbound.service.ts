import {Injectable, Logger, OnModuleInit} from '@nestjs/common';
import {EventEmitter2, OnEvent} from "@nestjs/event-emitter";
import {GliderEvents} from "../../shared/GliderEvents";
import {StartMethode} from "../../processing/processing/processing";
import {StartsService} from "../../services/apiservice/starts.service";
import {AanwezigVliegtuigService} from "../../services/apiservice/aanwezig-vliegtuig.service";
import {HeliosStart} from "../../types/Helios";
import {DateTime} from "luxon";
import {HeliosEvents} from "../../shared/HeliosEvents";

@Injectable()
export class HeliosOutboundService implements OnModuleInit {
    private readonly logger = new Logger(HeliosOutboundService.name);

    constructor(private readonly eventEmitter: EventEmitter2,
                private readonly startsService: StartsService,
                private readonly aanwezigVliegtuigService: AanwezigVliegtuigService) {}

    onModuleInit(): any {
        this.logger.log('HeliosOutboundService outbound initialized');
    }

    @OnEvent(GliderEvents.GliderStart)
    handleStartReceivedEvent(startID:number, startMethode: StartMethode, sleepKistID: number)
    {
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
                    OPMERKINGEN: (startMethode !== undefined && startMethode !== start.STARTMETHODE_ID) ? `Controleer startmethode, lijkt ${StartMethode[startMethode]} te zijn` : start.OPMERKINGEN
                }

                try {
                    this.startsService.updateStart(s).then(() => {
                        this.eventEmitter.emit(HeliosEvents.OnStartRecorded, startID);
                    });
                }
                catch (e) {
                    this.logger.error(`Error updating starttijd: ${startID}`);
                }
            }
        })
    }

    @OnEvent(GliderEvents.GliderLanded)
    handleLandedReceivedEvent(startID:number)
    {
        this.startsService.getStart(startID).then((start: HeliosStart) => {

            if ((start.LANDINGSTIJD !== undefined) && (start.LANDINGSTIJD !== null))
            {
                this.logger.log('Landingstijd al aanwezig Helios');
            }
            else {
                this.logger.log('Landingstijd wordt opgeslagen in Helios');

                const s: HeliosStart = {
                    ID: startID
                }

                if ((start.STARTTIJD === undefined) || (start.STARTTIJD === null))
                {
                    this.logger.error(`Starttijd is niet aanwezig bij landing: ${startID}`);
                    s.OPMERKINGEN = 'Starttijd niet aanwezig bij landing om ' + DateTime.now().toFormat('HH:mm');
                }
                else
                    s.LANDINGSTIJD = DateTime.now().toFormat('HH:mm');

                try {
                    this.startsService.updateStart(s).then(() => {
                        this.eventEmitter.emit(HeliosEvents.OnLandedRecorded, startID);
                    });
                }
                catch (e) {
                    this.logger.error(`Error updating landingstijd: ${startID}`);
                }
            }
        })
    }

    @OnEvent(GliderEvents.SleepHoogte)
    handleUpdateSleepHoogteReceivedEvent(startID: number, hoogte: number)
    {
        const s: HeliosStart = {
            ID: startID,
            SLEEP_HOOGTE: hoogte
        }
        try
        {
            this.startsService.updateStart(s);
        }
        catch (e)
        {
            this.logger.error(`Error updating sleephoogte: ${startID} ${hoogte}`);
        }
    }

    @OnEvent(GliderEvents.GliderAanmelden)
    handleGliderAanmeldenReceivedEvent(vliegtuigID: number, vliegveldID:number)
    {
        this.aanwezigVliegtuigService.aanmelden(DateTime.now(), vliegtuigID, vliegveldID);
    }
}

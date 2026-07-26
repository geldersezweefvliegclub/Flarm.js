import {Injectable, Logger, OnModuleInit} from '@nestjs/common';
import {EventEmitter2, OnEvent} from "@nestjs/event-emitter";
import {GliderEvents} from "../shared/GliderEvents";
import {StartMethode} from "../processing/processing";
import {StartsService} from "./apiservice/starts.service";
import {AanwezigVliegtuigService} from "./apiservice/aanwezig-vliegtuig.service";
import {HeliosStart} from "../types/Helios";
import {DateTime} from "luxon";
import {HeliosEvents} from "../shared/HeliosEvents";

@Injectable()
export class HeliosOutboundWorker implements OnModuleInit {
    private readonly logger = new Logger(HeliosOutboundWorker.name);

    constructor(private readonly eventEmitter: EventEmitter2,
                private readonly startsService: StartsService,
                private readonly aanwezigVliegtuigService: AanwezigVliegtuigService) {}

    onModuleInit(): any {
        this.logger.log('HeliosOutboundWorker outbound initialized');
    }

    // Flarm heeft gedetecteerd dat een vliegtuig gestart is  (zie processing.ts). Komt via een event hier binnen
    // Sla de starttijd op in Helios, maar alleen als dat nog niet gebeurd is (bv. handmatig al ingevoerd door de toren).
    @OnEvent(GliderEvents.GliderStart)
    handleStartReceivedEvent(startID:number)
    {
        // huidige stand van de start ophalen uit Helios (kan al een starttijd bevatten)
        this.startsService.getStart(startID).then((start: HeliosStart) => {
            if((start.STARTTIJD !== undefined) && (start.LANDINGSTIJD !== null))
            {
                // er staat al een starttijd in Helios -> niets doen, alleen loggen
                this.logger.warn('Starttijd al aanwezig in Helios');
            }
            else
            {
                this.logger.verbose('Starttijd wordt opgeslagen in Helios');

                // alleen ID en STARTTIJD meesturen, de rest van de start blijft ongewijzigd
                const s: HeliosStart =
                {
                    ID: startID,
                    STARTTIJD: DateTime.now().toFormat('HH:mm'),
                }

                this.startsService.updateStart(s).then(() => {
                    // andere services (bv. websocket/UI) laten weten dat de starttijd nu bekend is
                    this.eventEmitter.emit(HeliosEvents.OnStartRecorded, startID);
                }).catch(() => {
                    this.logger.error(`Error updating starttijd: ${startID}`);
                });
            }
        }).catch((e) => {
            this.logger.error(`Error ophalen start ${startID}: ${e?.message ?? e}`);
        });
    }

    // Flarm heeft gedetecteerd dat een vliegtuig is geland (direct, voorspeld of na een timeout, zie
    // processing.ts). Sla de landingstijd op in Helios, maar alleen als er al een starttijd bekend is
    // en er nog geen landingstijd is ingevuld. Ontbreekt de starttijd, dan gaat er iets niet goed gegaan
    // (bv. de start is niet herkend) en wordt dit alleen als opmerking bij de start gezet.
    @OnEvent(GliderEvents.GliderLanded)
    handleLandedReceivedEvent(startID:number)
    {
        // huidige stand van de start ophalen uit Helios (kan al een landingstijd bevatten)
        this.startsService.getStart(startID).then((start: HeliosStart) => {

            if ((start.LANDINGSTIJD !== undefined) && (start.LANDINGSTIJD !== null))
            {
                // er staat al een landingstijd in Helios -> niets doen, alleen loggen
                this.logger.warn('Landingstijd al aanwezig Helios');
            }
            else {
                this.logger.verbose('Landingstijd wordt opgeslagen in Helios');

                const s: HeliosStart = {
                    ID: startID
                }

                if ((start.STARTTIJD === undefined) || (start.STARTTIJD === null))
                {
                    // geen starttijd bekend: er is iets misgegaan bij het opstijgen (bv. start niet
                    // herkend). Landingstijd wordt dan NIET ingevuld. Let op: 's.OPMERKINGEN' wordt hier
                    // wel gevuld, maar in deze tak wordt updateStart() niet aangeroepen, dus dit wordt
                    // niet opgeslagen in Helios — er komt alleen een regel in de eigen log terecht.
                    this.logger.error(`Starttijd is niet aanwezig bij landing: ${startID}`);
                    s.OPMERKINGEN = 'Starttijd niet aanwezig bij landing om ' + DateTime.now().toFormat('HH:mm');
                }
                else
                {
                    // starttijd is bekend -> landingstijd invullen en opslaan
                    s.LANDINGSTIJD = DateTime.now().toFormat('HH:mm');

                    this.startsService.updateStart(s).then(() =>
                    {
                        // andere services (bv. websocket/UI) laten weten dat de landingstijd nu bekend is
                        this.eventEmitter.emit(HeliosEvents.OnLandedRecorded, startID);
                    }).catch(() =>
                    {
                        this.logger.error(`Error updating landingstijd: ${startID}`);
                    });
                }
            }
        }).catch((e) => {
            this.logger.error(`Error ophalen start ${startID}: ${e?.message ?? e}`);
        });
    }

    // Het sleepvliegtuig is geland; processing.ts heeft via SLEEPKIST_ID uitgezocht welk zweefvliegtuig
    // (welke start) hij sleepte, en geeft hier de start van dat zweefvliegtuig door (startID) samen met
    // de bereikte sleephoogte (hoogte). Sla dit op als SLEEP_HOOGTE bij die start.
    @OnEvent(GliderEvents.SleepHoogte)
    handleUpdateSleepHoogteReceivedEvent(startID: number, hoogte: number)
    {
        // alleen ID en SLEEP_HOOGTE meesturen, de rest van de start (van het zweefvliegtuig) blijft ongewijzigd
        const s: HeliosStart = {
            ID: startID,
            SLEEP_HOOGTE: hoogte
        }
        try
        {
            // updateStart() geeft een Promise terug; die wordt hier niet afgewacht/gecontroleerd, dus een
            // mislukte opslag (bv. netwerkfout) komt niet in de catch hieronder terecht, alleen een
            // synchrone fout (bv. verkeerde data) zou dat doen
            this.startsService.updateStart(s);
        }
        catch (e)
        {
            this.logger.error(`Error updating sleephoogte: ${startID} ${hoogte}`);
        }
    }


    // Wordt aangeroepen zodra processing.ts (via Flarm-data: klimsnelheid, en zo nodig positie/snelheid/koers
    // t.o.v. andere vliegtuigen) 30 seconden na het opstijgen heeft bepaald hoe een vliegtuig is gestart
    // (lier, sleep of zelfstart) en, bij een sleepstart, welk vliegtuig (SleepkistID) de sleepkist was.
    //
    // Deze Flarm-detectie wordt hier gebruikt om de Helios-startlijst te corrigeren/aan te vullen:
    //  1) SLEEPKIST_ID op de start van het zweefvliegtuig: dit veld wordt normaal door de toren
    //     vooraf ingevuld, maar kan ontbreken of fout zijn. Is Flarm het eens dat het een sleepstart was
    //     en wijkt SLEEPKIST_ID af, dan wordt het hier gecorrigeerd. Dit is belangrijk, want later — als
    //     dit sleepvliegtuig landt — wordt via SLEEPKIST_ID teruggezocht welk zweefvliegtuig hij sleepte
    //     om de sleephoogte (SLEEP_HOOGTE) op te slaan (zie processing.ts en getStartBySleepkistID
    //     in helios-inbound-worker.ts). Zonder correct SLEEPKIST_ID lukt die koppeling niet.
    //  2) STARTMETHODE_ID: als de vooraf ingevoerde startmethode niet overeenkomt met wat Flarm detecteerde,
    //     wordt dit NIET automatisch overschreven (kan ook een fout in de detectie zijn), maar wordt er
    //     een opmerking (OPMERKINGEN) bij de start gezet zodat iemand het handmatig kan controleren.
    @OnEvent(GliderEvents.StartMethodeDetermined)
    handleStartMethodeDeterminedEvent(startID: number, startMethode: StartMethode, SleepkistID: number)
    {
        // huidige stand van de start ophalen uit Helios, zodat we alleen corrigeren wat echt afwijkt
        this.startsService.getStart(startID).then((start: HeliosStart) => {
            const s: HeliosStart = { ID: startID };
            let changed = false;   // wordt true zodra er iets is dat opgeslagen moet worden

            // sleepvliegtuig niet (goed) ingevuld -> corrigeren zodra bekend (SleepkistID > 0 betekent
            // dat Flarm daadwerkelijk een sleepvliegtuig heeft herkend; -1 betekent "onbekend" en mag
            // een reeds ingevuld SLEEPKIST_ID nooit overschrijven)
            if (startMethode === StartMethode.Sleep && SleepkistID > 0 && start.SLEEPKIST_ID !== SleepkistID)
            {
                s.SLEEPKIST_ID = SleepkistID;
                changed = true;
                this.logger.log(`Sleepkist gecorrigeerd: start ${startID} → vliegtuig ${SleepkistID} (was ${start.SLEEPKIST_ID})`);
            }

            // startmethode komt niet overeen met wat vooraf was ingevuld -> alleen melden, niet overschrijven
            // (opmerking wordt achter een eventuele bestaande opmerking geplakt, zodat niets verloren gaat)
            if (start.STARTMETHODE_ID !== startMethode)
            {
                s.OPMERKINGEN = `Controleer startmethode, ${StartMethode[startMethode]} gedetecteerd` + (start.OPMERKINGEN ? ` : ${start.OPMERKINGEN}` : '');
                changed = true;
            }

            // niets afwijkend gevonden -> geen aanroep naar Helios nodig
            if (!changed)
                return;

            // opslaan van alleen de gewijzigde velden (ID + SLEEPKIST_ID en/of OPMERKINGEN)
            this.startsService.updateStart(s).then(() => {
                this.logger.log(`Start bijgewerkt: ${startID}`);
            }).catch(() => {
                this.logger.error(`Error updating startmethode/sleepkist: ${startID}`);
            });
        }).catch((e) => {
            this.logger.error(`Error ophalen start ${startID}: ${e?.message ?? e}`);
        });
    }

    // Flarm heeft gedetecteerd dat een vliegtuig binnen het vliegveld is (polygon-check in
    // processing.ts) en nog niet is aangemeld. Meld het vliegtuig aan als aanwezig op het vliegveld.
    @OnEvent(GliderEvents.GliderAanmelden)
    handleGliderAanmeldenReceivedEvent(vliegtuigID: number, vliegveldID:number)
    {
        // meld het vliegtuig aan als 'aanwezig' op dit vliegveld, met het huidige tijdstip
        this.aanwezigVliegtuigService.aanmelden(DateTime.now(), vliegtuigID, vliegveldID);
    }
}
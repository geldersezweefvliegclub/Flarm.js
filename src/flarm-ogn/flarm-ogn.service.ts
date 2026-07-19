import {Injectable, Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {Cron, CronExpression} from '@nestjs/schedule';
import * as net from 'net';
import {FlarmEvents} from "../shared/FlarmEvents";
import {EventEmitter2} from "@nestjs/event-emitter";
import {AprsMessage} from "./AprsMessage";
import {ConfigService} from "@nestjs/config";
import {DateTime, Interval} from 'luxon';
import {KalmanFilter3D} from "./KalmanFilter3D";
import * as fs from "node:fs";
import * as zlib from "node:zlib";
import * as readline from "node:readline";
import {OgnRecorder} from "./ogn-recorder";

// Eén geparste APRS/OGN-bericht (AprsMessage), aangevuld met de hoogte boven het vliegveld (AGL) en
// met de door het Kalman-filter (KalmanFilter3D) gladgestreken waarden. De 'kalman_*' velden zijn
// betrouwbaarder dan de ruwe waarden uit het bericht, omdat OGN-posities kunnen ruisen/springen.
export class FlarmData extends AprsMessage
{
    altitude_agl: number;      // hoogte boven het vliegveld (altitude - veldhoogte), nooit negatief

    kalman_speed: number;          // gladgestreken snelheid (km/h)
    kalman_climb: number;          // gladgestreken klimsnelheid (m/s)
    kalman_altitude_agl: number;   // gladgestreken hoogte boven het vliegveld
    kalman_latitude: number;       // gladgestreken breedtegraad
    kalman_longitude: number;      // gladgestreken lengtegraad
}

// Deze service onderhoudt de live verbinding met het OGN/APRS-netwerk (of speelt in simulatormodus een
// eerder opgenomen sessie af), parst de binnenkomende Flarm/OGN-berichten, filtert ze door een Kalman-
// filter per vliegtuig, en stuurt het resultaat als FlarmEvents.DataReceived event de rest van de
// applicatie in (voornamelijk naar processing.ts, dat er de vlucht-status uit afleidt).
@Injectable()
export class FlarmOgnService implements  OnModuleInit, OnModuleDestroy
{
    private readonly logger = new Logger(FlarmOgnService.name);

    private client: net.Socket;                    // TCP-verbinding met de APRS-server
    private keepAliveIntervalId: NodeJS.Timeout;
    private unparsedData: string = '';              // restje van een bericht dat nog niet compleet was binnengekomen

    private flarmOntvangen: DateTime[] = [];                          // tijdstip laatste bericht per flarmId, voor removeLost()
    private kalmanContainer: { [key: string]: KalmanFilter3D } = {};  // één Kalman-filter per vliegtuig (flarmId)
    private lastTimestampSec: { [key: string]: number } = {};         // laatst verwerkte berichttijd (seconden in de dag) per flarmId, voor duplicaatdetectie

    private veldHoogte: number = 0;   // hoogte van het vliegveld zelf (uit configuratie), om AGL-hoogtes te kunnen berekenen

    constructor(private readonly configService: ConfigService,
                private readonly eventEmitter: EventEmitter2,
                private readonly recorder: OgnRecorder) {
    }

    onModuleInit(): any {
        this.veldHoogte = this.configService.get('Vliegveld.hoogte');
        const config =  this.configService.get('OGN');
        this.logger.log('FlarmOgnService initialized');

        if (config.simulator) {
            // in plaats van een live APRS-verbinding: een eerder opgenomen bestand terug afspelen (voor test/ontwikkeling)
            this.logger.log('------------- RUNNING IN SIMULATOR MODE -------------');
            setTimeout(() =>
            {
                this.runSimulator(config.simulator);
            }, 15000); // Wacht 15 seconden before voor simulator
            return;
        }
        else
        {
            // pas na 15 seconden verbinden, zodat de rest van de applicatie (Helios-data, config) eerst geladen is
            setTimeout(() =>
            {
                this.connectToAprsServer();
            }, 15000); // Wacht 15 seconden voor connecting
        }

        // Stuur een keep-alive bericht naar de server iedere 5 minuten
        this.keepAliveIntervalId = setInterval(() => this.client.write('# Keep alive\n'), 5 * 60 * 1000);
    }

    onModuleDestroy(): any {
        this.logger.verbose('FlarmOgnService destroyed');
        // verbinding netjes afsluiten en keep-alive timer stoppen
        this.closeConnection();

        clearInterval(this.keepAliveIntervalId);
    }

    // Zet een TCP-verbinding op met de APRS/OGN-server en logt daarna in met de gegevens uit de
    // configuratie (gebruikersnaam, wachtwoord, filter — het filter bepaalt welke gebied we
    // van de server ontvangen. Registreert ook wat er moet gebeuren bij binnenkomende data, fouten
    // en het sluiten van de verbinding.
    private connectToAprsServer() {
        const config =  this.configService.get('OGN');

        if (config.simulator) {
            // Mocht deze functie toch worden aangeroepen in simulatormodus, dan alsnog simuleren i.p.v. verbinden
            this.logger.log('Running in simulator mode');
            this.runSimulator(config.simulator);
            return;
        }

        this.client = new net.Socket();

        this.client.connect(config.aprsPort, config.aprsServer, () =>
        {
            this.logger.verbose(`Connected to APRS server ${config.aprsServer}:${config.aprsPort}`);

            // Send login information
            const aprsName = config.aprsUser;
            const aprsPass = config.aprsPass;
            const appName = config.aprsName;
            const appVersion = config.aprsVersion;
            const filter = config.aprsFilter;

            // dit is het standaard APRS-IS login-protocol, verplicht direct na het opzetten van de TCP-verbinding
            const loginMessage = `user ${aprsName} pass ${aprsPass} vers ${appName} ${appVersion} filter ${filter}\n`;
            this.client.write(loginMessage);
            this.logger.verbose('Sent login message to APRS server');
        });

        this.client.on('data', (data) =>
        {
            // Verwerkt de binnenkomende data van de APRS-server. De data kan meerdere regels bevatten, en een regel
            // kan in meerdere chunks binnenkomen, dus we bewaren een eventueel onvolledig laatste stukje voor de volgende keer.
            this.handleIncomingData(data.toString());
        });

        this.client.on('error', (error) =>
        {
            // bij een verbindingsfout proberen we het na 5 seconden opnieuw
            this.logger.error('Connection error:', error);
            this.reconnectToAprsServer();
        });

        this.client.on('close', () =>
        {
            // ook als de server de verbinding zelf sluit (zonder expliciete error), opnieuw verbinden
            this.logger.warn('Connection closed');
            this.reconnectToAprsServer();
        });

    }

    // herverbinden na een fout of onverwachte sluiting van de verbinding
    private reconnectToAprsServer() {
        this.logger.log('Reconnecting to APRS server in 5 seconds...');
        setTimeout(() => this.connectToAprsServer(), 5000); // Wait 5 seconds before reconnecting
    }

    // netjes de verbinding sluiten en de keep-alive timer stoppen (bv. bij het afsluiten van de applicatie)
    private closeConnection() {
        if (this.client) {
            this.client.end();
            this.logger.log('Connection closed gracefully');
        }

        if (this.keepAliveIntervalId) {
            clearInterval(this.keepAliveIntervalId);
        }
    }

    // Verwerkt een chunk ruwe tekstdata van de APRS-verbinding (of van de simulator). Een TCP-chunk komt
    // niet noodzakelijk overeen met precies één of meerdere volledige regels, dus we knippen op regeleinde
    // en bewaren een eventueel onvolledig laatste stukje voor de volgende keer. Elke volledige regel wordt
    // geparst tot een FlarmData, gefilterd (duplicaten/ruis eruit, Kalman-filter erop) en als event
    // doorgestuurd naar de rest van de applicatie.
    private handleIncomingData(data: string) {
        const dataArray = (this.unparsedData + data).split('\r\n');
        this.unparsedData += dataArray.pop();           // Save the last line, as it may be incomplete

        dataArray.forEach((line) => {
            if (line !== '')                            // Ignore empty lines
            {
                const ignore = line.startsWith('#')     // APRS-servers sturen af en toe commentaarregels/statusberichten, beginnend met '#'
                //this.logger.debug('Received data:' +  ((ignore) ? "IGNORE " : "") + line);

                if (!ignore) // Ignore comments
                {
                    // ruwe APRS-regel parsen naar een gestructureerd bericht (positie, snelheid, hoogte, ...)
                    const msg: FlarmData = new AprsMessage(line) as FlarmData;
                    msg.altitude_agl = Math.max(0, (msg.altitude - this.veldHoogte));       // mag nooit negatief zijn

                    // ruwe/foutieve metingen eruit filteren voordat we ze verder verwerken
                    if (msg.flarmId != null && msg.speed < 300 && msg.altitude_agl < 3500)          // we vliegen nooit sneller dan 300 km/h en niet boven 3500 meter
                    {
                        // ruwe data wegschrijven, o.a. bruikbaar om later opnieuw af te spelen via de simulator
                        this.recorder.record(line);

                        // OGN vaak via meerdere ontvangers gerelayed: dezelfde (of oudere) meting kan
                        // vertraagd nogmaals binnenkomen. Dat verstoort de Kalman-filter (zie dt≈0 met
                        // grote hoogtesprong), dus alles wat niet strikt nieuwer is dan het laatst
                        // verwerkte bericht van dit toestel wordt genegeerd.
                        const timestampSec = this.parseTimestampSeconds(msg.timestamp);
                        const lastSec = this.lastTimestampSec[msg.flarmId];
                        if (lastSec != null) {
                            const diff = timestampSec - lastSec;
                            const isDuplicateOrStale = diff <= 0 && diff > -43200; // negatief, tenzij middernacht-overgang
                            if (isDuplicateOrStale) {
                                return;   // dit bericht overslaan, niet verder verwerken
                            }
                        }
                        this.lastTimestampSec[msg.flarmId] = timestampSec;

                        // eerste keer dat we iets van dit vliegtuig zien (in ieder geval sinds de laatste
                        // keer dat removeLost() het opruimde): een nieuw, "vers" Kalman-filter aanmaken
                        if (this.flarmOntvangen[msg.flarmId] == null)
                            this.kalmanContainer[msg.flarmId] = new KalmanFilter3D(this.veldHoogte);

                        // ruwe positie/hoogte door het (per-vliegtuig) Kalman-filter halen om ruis eruit te halen
                        // en er een klimsnelheid uit af te leiden
                        const k = this.kalmanContainer[msg.flarmId].filter(
                           msg.latitude, msg.longitude, msg.altitude, msg.receivedTime);
                        msg.kalman_speed        = k.speed;
                        msg.kalman_altitude_agl = k.altitude_agl;
                        msg.kalman_climb        = k.climb;
                        msg.kalman_latitude     = k.latitude;
                        msg.kalman_longitude    = k.longitude;

                        // tijdstip bijwerken voor de "verbinding nog levend"-check in removeLost()
                        this.flarmOntvangen[msg.flarmId] = DateTime.now();
                        // het verrijkte bericht doorsturen; processing.ts luistert hierop om de vluchtstatus bij te werken
                        this.eventEmitter.emit(FlarmEvents.DataReceived, msg);
                    }
                }
            }
        });
    }

    // Elke minuut controleren of er vliegtuigen zijn waarvan al meer dan 15 minuten geen Flarm-bericht meer
    // is ontvangen (bv. uit bereik gevlogen, Flarm uitgeschakeld). Hun opgebouwde toestand (Kalman-filter,
    // laatst-gezien-tijdstip, laatste timestamp) wordt dan opgeruimd, en processing.ts wordt via
    // FlarmEvents.LostFlarm op de hoogte gebracht zodat het die het vliegtuig ook uit zijn eigen cache haalt.
    @Cron(CronExpression.EVERY_MINUTE)
    removeLost() {
        const now = DateTime.now();
        for (var key in this.flarmOntvangen) {
            const diff = Interval.fromDateTimes(this.flarmOntvangen[key], now);
            if (diff.length('minutes') > 15)
            {
                delete this.flarmOntvangen[key];
                delete this.kalmanContainer[key];
                delete this.lastTimestampSec[key];

                this.eventEmitter.emit(FlarmEvents.LostFlarm, key);
            }
        }
    }

    // Het APRS-timestamp-veld (bv. "123456" = 12:34:56 UTC) omzetten naar het aantal seconden sinds
    // middernacht, zodat we berichten van hetzelfde vliegtuig chronologisch kunnen vergelijken (zie
    // handleIncomingData, duplicaat-/verouderd-bericht-detectie).
    private parseTimestampSeconds(timestamp: string): number {
        const h = parseInt(timestamp.substring(0, 2), 10);
        const m = parseInt(timestamp.substring(2, 4), 10);
        const s = parseInt(timestamp.substring(4, 6), 10);
        return h * 3600 + m * 60 + s;
    }

    // Speelt een eerder opgenomen bestand (zie OgnRecorder) af alsof het live binnenkomende APRS-data is.
    // Elke regel in het bestand begint met een ISO-timestamp gevolgd door een spatie en dan de originele
    // APRS-regel. De berichten worden met dezelfde tussenpozen als in het origineel afgespeeld (i.p.v. zo
    // snel mogelijk), zodat de verwerking (Kalman-filter, statusmachine in processing.ts) zich precies
    // gedraagt zoals bij een echte, live sessie. Bedoeld voor testen/ontwikkelen zonder live OGN-verbinding.
    async runSimulator(filename: string) {
        if (!fs.existsSync(filename)) {
            this.logger.error(`Simulator file does not exist: ${filename}`);
            return;
        }

        this.logger.log(`Simulator: replaying ${filename}`);

        // .gz-bestanden automatisch uitpakken tijdens het lezen; anders het bestand direct lezen
        const raw = fs.createReadStream(filename);
        const input = filename.endsWith('.gz') ? raw.pipe(zlib.createGunzip()) : raw;
        const rl = readline.createInterface({ input, crlfDelay: Infinity });

        let firstTimestamp: DateTime | null = null;   // tijdstip van de allereerste regel in het bestand
        let replayStart: DateTime | null = null;       // (echte) tijdstip waarop het afspelen begon
        let lastLoggedSecond = -1;                     // om niet elke regel maar hooguit 1x per seconde te loggen

        for await (const line of rl) {
            const spaceIdx = line.indexOf(' ');
            if (spaceIdx < 0) continue;    // regel zonder timestamp-scheiding, kan niet geparst worden

            const timestamp = DateTime.fromISO(line.substring(0, spaceIdx));
            if (!timestamp.isValid) continue;

            if (firstTimestamp === null) {
                // referentiepunt: vanaf hier meten we zowel de "originele" als de "afspeel"-tijd
                firstTimestamp = timestamp;
                replayStart = DateTime.now();
            }

            // Preserve original inter-message timing
            // hoeveel tijd zou er, gezien de originele timestamps, tussen dit bericht en het eerste moeten
            // zitten, minus hoeveel afspeeltijd er al daadwerkelijk verstreken is -> dat verschil inhalen/wachten
            const waitMs = timestamp.diff(firstTimestamp).toMillis() - DateTime.now().diff(replayStart).toMillis();
            if (waitMs > 0) {
                await this.sleep(waitMs);
            }

            if (timestamp.second !== lastLoggedSecond) {
                lastLoggedSecond = timestamp.second;
                this.logger.log('Simulator: ' + timestamp.toFormat('HH:mm:ss'));
            }

            // de rest van de regel (na de timestamp) is de originele APRS-regel; die verwerken we exact
            // zoals live binnenkomende data (vandaar de toegevoegde '\r\n', het regeleinde dat handleIncomingData verwacht)
            this.handleIncomingData(line.substring(spaceIdx + 1) + '\r\n');
        }

        this.logger.log('Simulator: replay complete');
    }

    // kleine helper om in runSimulator() te kunnen 'await'-en tot een bepaald aantal milliseconden verstreken is
    async sleep(ms)
    {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

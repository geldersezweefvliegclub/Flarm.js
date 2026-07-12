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

export class FlarmData extends AprsMessage
{
    altitude_agl: number;

    kalman_speed: number;
    kalman_climb: number;
    kalman_altitude_agl: number;
    kalman_latitude: number;
    kalman_longitude: number;
}

@Injectable()
export class FlarmOgnService implements  OnModuleInit, OnModuleDestroy
{
    private readonly logger = new Logger(FlarmOgnService.name);

    private client: net.Socket;
    private keepAliveIntervalId: NodeJS.Timeout;
    private unparsedData: string = '';

    private flarmOntvangen: DateTime[] = [];
    private kalmanContainer: { [key: string]: KalmanFilter3D } = {};
    private lastTimestampSec: { [key: string]: number } = {};

    private veldHoogte: number = 0;

    constructor(private readonly configService: ConfigService,
                private readonly eventEmitter: EventEmitter2,
                private readonly recorder: OgnRecorder) {
    }

    onModuleInit(): any {
        this.veldHoogte = this.configService.get('Vliegveld.hoogte');
        const config =  this.configService.get('OGN');
        this.logger.log('FlarmOgnService initialized');

        if (config.simulator) {
            this.logger.log('------------- RUNNING IN SIMULATOR MODE -------------');
            setTimeout(() =>
            {
                this.runSimulator(config.simulator);
            }, 15000); // Wait 15 seconds before start simulator
            return;
        }
        else
        {
            setTimeout(() =>
            {
                this.connectToAprsServer();
            }, 15000); // Wait 15 seconds before connecting
        }

        // Send a keep-alive message to the server every 5 minutes
        this.keepAliveIntervalId = setInterval(() => this.client.write('# Keep alive\n'), 5 * 60 * 1000);
    }

    onModuleDestroy(): any {
        this.logger.verbose('FlarmOgnService destroyed');
        this.closeConnection();

        clearInterval(this.keepAliveIntervalId);
    }

    private connectToAprsServer() {
        const config =  this.configService.get('OGN');

        if (config.simulator) {
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

            const loginMessage = `user ${aprsName} pass ${aprsPass} vers ${appName} ${appVersion} filter ${filter}\n`;
            this.client.write(loginMessage);
            this.logger.verbose('Sent login message to APRS server');
        });

        this.client.on('data', (data) =>
        {
            // Parse the incoming data
            this.handleIncomingData(data.toString());
        });

        this.client.on('error', (error) =>
        {
            this.logger.error('Connection error:', error);
            this.reconnectToAprsServer();
        });

        this.client.on('close', () =>
        {
            this.logger.warn('Connection closed');
            this.reconnectToAprsServer();
        });

    }

    private reconnectToAprsServer() {
        this.logger.log('Reconnecting to APRS server in 5 seconds...');
        setTimeout(() => this.connectToAprsServer(), 5000); // Wait 5 seconds before reconnecting
    }

    private closeConnection() {
        if (this.client) {
            this.client.end();
            this.logger.log('Connection closed gracefully');
        }

        if (this.keepAliveIntervalId) {
            clearInterval(this.keepAliveIntervalId);
        }
    }

    private handleIncomingData(data: string) {
        const dataArray = (this.unparsedData + data).split('\r\n');
        this.unparsedData += dataArray.pop();           // Save the last line, as it may be incomplete

        dataArray.forEach((line) => {
            if (line !== '')                            // Ignore empty lines
            {
                const ignore = line.startsWith('#')
                //this.logger.debug('Received data:' +  ((ignore) ? "IGNORE " : "") + line);

                if (!ignore) // Ignore comments
                {
                    const msg: FlarmData = new AprsMessage(line) as FlarmData;
                    msg.altitude_agl = Math.max(0, (msg.altitude - this.veldHoogte));       // mag nooit negatief zijn

                    if (msg.flarmId != null && msg.speed < 300 && msg.altitude_agl < 3500)          // we vliegen nooit sneller dan 300 km/h en niet boven 3500 meter
                    {
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
                                return;
                            }
                        }
                        this.lastTimestampSec[msg.flarmId] = timestampSec;

                        if (this.flarmOntvangen[msg.flarmId] == null)
                            this.kalmanContainer[msg.flarmId] = new KalmanFilter3D(this.veldHoogte);

                        const k = this.kalmanContainer[msg.flarmId].filter(
                            msg.latitude, msg.longitude, msg.altitude, msg.receivedTime);
                        msg.kalman_speed        = k.speed;
                        msg.kalman_altitude_agl = k.altitude_agl;
                        msg.kalman_climb        = k.climb;
                        msg.kalman_latitude     = k.latitude;
                        msg.kalman_longitude    = k.longitude;

                        this.flarmOntvangen[msg.flarmId] = DateTime.now();
                        this.eventEmitter.emit(FlarmEvents.DataReceived, msg);
                    }
                }
            }
        });
    }

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

    private parseTimestampSeconds(timestamp: string): number {
        const h = parseInt(timestamp.substring(0, 2), 10);
        const m = parseInt(timestamp.substring(2, 4), 10);
        const s = parseInt(timestamp.substring(4, 6), 10);
        return h * 3600 + m * 60 + s;
    }

    async runSimulator(filename: string) {
        if (!fs.existsSync(filename)) {
            this.logger.error(`Simulator file does not exist: ${filename}`);
            return;
        }

        this.logger.log(`Simulator: replaying ${filename}`);

        const raw = fs.createReadStream(filename);
        const input = filename.endsWith('.gz') ? raw.pipe(zlib.createGunzip()) : raw;
        const rl = readline.createInterface({ input, crlfDelay: Infinity });

        let firstTimestamp: DateTime | null = null;
        let replayStart: DateTime | null = null;
        let lastLoggedSecond = -1;

        for await (const line of rl) {
            const spaceIdx = line.indexOf(' ');
            if (spaceIdx < 0) continue;

            const timestamp = DateTime.fromISO(line.substring(0, spaceIdx));
            if (!timestamp.isValid) continue;

            if (firstTimestamp === null) {
                firstTimestamp = timestamp;
                replayStart = DateTime.now();
            }

            // Preserve original inter-message timing
            const waitMs = timestamp.diff(firstTimestamp).toMillis() - DateTime.now().diff(replayStart).toMillis();
            if (waitMs > 0) {
                await this.sleep(waitMs);
            }

            if (timestamp.second !== lastLoggedSecond) {
                lastLoggedSecond = timestamp.second;
                this.logger.log('Simulator: ' + timestamp.toFormat('HH:mm:ss'));
            }

            this.handleIncomingData(line.substring(spaceIdx + 1) + '\r\n');
        }

        this.logger.log('Simulator: replay complete');
    }

    async sleep(ms)
    {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

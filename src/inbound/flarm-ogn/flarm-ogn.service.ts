import {Injectable, Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import * as net from 'net';
import {FlarmEvents} from "../../shared/FlarmEvents";
import {EventEmitter2} from "@nestjs/event-emitter";
import {AprsMessage} from "./AprsMessage";
import {ConfigService} from "@nestjs/config";
import {DateTime, Interval} from 'luxon';
import {KalmanFilter} from "./KalmanFilter";
import * as fs from "node:fs";
import * as readline from "node:readline";

export class FlarmData extends AprsMessage
{
    altitude_agl: number;

    kalman_speed: number;
    kalman_climb: number;
    kalman_altitude_agl: number;
}

interface kalmanStore {
    [key: string] : KalmanFilter;
}

@Injectable()
export class FlarmOgnService implements  OnModuleInit, OnModuleDestroy
{
    private client: net.Socket;
    private keepAliveIntervalId: NodeJS.Timeout;
    private removeLostntervalId: NodeJS.Timeout;
    private readonly logger = new Logger(FlarmOgnService.name);
    private unparsedData: string = '';

    private flarmOntvangen: DateTime[] = [];
    private kalmanSpeedContainer: kalmanStore[] = [];
    private kalmanClimbContainer: kalmanStore[] = [];
    private kalmanAltitudeContainer: kalmanStore[] = [];

    private veldHoogte: number = 0;

    constructor(private readonly configService: ConfigService,
                private readonly eventEmitter: EventEmitter2) {
    }

    onModuleInit(): any {
        this.veldHoogte = this.configService.get('Vliegveld.hoogte');
        const config =  this.configService.get('OGN');
        console.log('FlarmOgnService initialized');

        this.removeLostntervalId = setInterval(() => this.removeLost(), 1 * 60 * 1000);

        if (config.simulator) {
            this.logger.log('Running in simulator mode');
            this.runSimulator(config.simulator);
            return;
        }

        setTimeout(() => {this.connectToAprsServer();}, 15000); // Wait 15 seconds before connecting

        // Send a keep-alive message to the server every 5 minutes
        this.keepAliveIntervalId = setInterval(() => this.client.write('# Keep alive\n'), 5 * 60 * 1000);
    }

    onModuleDestroy(): any {
        console.log('FlarmOgnService destroyed');
        this.closeConnection();

        clearInterval(this.removeLostntervalId);
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

        this.client.connect(config.aprsPort, config.aprsServer, () => {
            this.logger.log(`Connected to APRS server ${config.aprsServer}:${config.aprsPort}`);

            // Send login information
            const aprsName = config.aprsUser;
            const aprsPass = config.aprsPass;
            const appName = config.aprsName;
            const appVersion = config.aprsVersion;
            const filter = config.aprsFilter;

            const loginMessage = `user ${aprsName} pass ${aprsPass} vers ${appName} ${appVersion} filter ${filter}\n`;
            this.client.write(loginMessage);
            this.logger.log('Sent login message to APRS server');
        });

        this.client.on('data', (data) => {
            // Parse the incoming data
            this.handleIncomingData(data.toString());
        });

        this.client.on('error', (error) => {
            this.logger.error('Connection error:', error);
            this.reconnectToAprsServer();
        });

        this.client.on('close', () => {
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

                    if (msg.flarmId != null)
                    {
                        if (this.flarmOntvangen[msg.flarmId] == null)
                        {
                            this.kalmanSpeedContainer[msg.flarmId] = new KalmanFilter();
                            this.kalmanClimbContainer[msg.flarmId] = new KalmanFilter();
                            this.kalmanAltitudeContainer[msg.flarmId] = new KalmanFilter();
                        }

                        msg.kalman_speed = Math.round(this.kalmanSpeedContainer[msg.flarmId].filter(msg.speed));
                        msg.kalman_altitude_agl = Math.round(this.kalmanAltitudeContainer[msg.flarmId].filter(msg.altitude_agl));
                        msg.kalman_climb = Math.round(100*this.kalmanClimbContainer[msg.flarmId].filter(msg.climbRate)) / 100;

                        this.flarmOntvangen[msg.flarmId] = DateTime.now();
                        this.eventEmitter.emit(FlarmEvents.DataReceived, msg);
                    }
                }
            }
        });
    }

    removeLost() {
        const now = DateTime.now();
        for (var key in this.flarmOntvangen) {
            const diff = Interval.fromDateTimes(this.flarmOntvangen[key], now);
            if (diff.length('minutes') > 15)
            {
                delete this.flarmOntvangen[key];
                delete this.kalmanSpeedContainer[key];
                delete this.kalmanClimbContainer[key];
                delete this.kalmanAltitudeContainer[key];

                this.eventEmitter.emit(FlarmEvents.LostFlarm, key);
            }
        }
    }

    async runSimulator(filename: string) {
        const fileStream = fs.createReadStream(filename);

        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        // Note: we use the crlfDelay option to recognize all instances of CR LF
        // ('\r\n') in input.txt as a single line break.
        var displayTijd = DateTime.now();

        for await (const line of rl) {
            if (line.includes('| OGN:'))
            {
                const timestamp = DateTime.fromSQL(line.split('| OGN:')[0]);

                if (timestamp.hour * 100 + timestamp.minute > 1354)
                {
                    while (DateTime.now().second != timestamp.second)
                    {
                        await this.sleep(100);
                    }

                    if (displayTijd.second != timestamp.second)
                    {
                        displayTijd = timestamp;
                        this.logger.log('Simulator: ' + displayTijd.toFormat('HH:mm:ss'));
                    }

                    this.handleIncomingData(line.split('| OGN:')[1] + '\r\n');
                }
            }
        }
    }

    async sleep(ms)
    {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

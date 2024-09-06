import {Injectable, Logger, OnModuleInit} from '@nestjs/common';
import {EventEmitter2, OnEvent} from "@nestjs/event-emitter";
import {FlarmEvents} from "../../shared/FlarmEvents";
import {AprsMessage} from "../../inbound/flarm-ogn/AprsMessage";
import {FlarmDataWithStatus} from "../../processing/processing/processing";
import {WebSocketEvents} from "../../shared/WebSocketEvents";
import {GliderStatus} from "../../shared/GliderStatus";
import {DateTime} from "luxon";
import * as fs from 'fs'
import {ConfigService} from "@nestjs/config";
import {HeliosInboundService} from "../../inbound/helios/helios-inbound.service";
import {GliderEvents} from "../../shared/GliderEvents";
import {HeliosStartDataset} from "../../types/Helios";
import {HeliosEvents} from "../../shared/HeliosEvents";

export class lastClientUpdate {
    sent:  FlarmDataWithStatus
    timestamp : DateTime

    constructor(flarmData: FlarmDataWithStatus) {
        this.sent = flarmData;
        this.timestamp = DateTime.now();
    }
}


@Injectable()
export class PegasusService implements  OnModuleInit{
    private readonly logger = new Logger(PegasusService.name);

    private lastClientUpdateStore: lastClientUpdate[] = [];
    private geoFence: string = undefined;

    constructor(private readonly configService: ConfigService,
                private readonly heliosInboundService: HeliosInboundService,
                private readonly eventEmitter: EventEmitter2) {
    }

    onModuleInit() {
    }

    // Er is nieuwe flarm data binnen gekomen, controleer of deze verstuurd moet worden
    @OnEvent(WebSocketEvents.PublishFlarm)
    handleDataReceivedEvent(payload:FlarmDataWithStatus)
    {
        const idx = this.lastClientUpdateStore.findIndex( (x) => x.sent.flarmData.flarmId === payload.flarmData.flarmId);
        const lastSent = (idx < 0) ? undefined : this.lastClientUpdateStore[idx];

        var sendUpdate = false;

        const isInside =  this.heliosInboundService.isInsidePolygon([payload.flarmData.longitude, payload.flarmData.latitude]);
        if (payload.SLEEPKIST === true)
            return;     // Ignore sleepkist

        if (payload.vliegtuigID === undefined)
            return;     // Ignore unknown vliegtuig

        if (isInside && payload.status === GliderStatus.On_Ground) {
            sendUpdate = true;
        }
        else if ((payload.startID !== undefined) || (payload.bijOnsGestart === true))
        {
            if (lastSent === undefined) {
                sendUpdate = true;
            }
            else if (payload.vliegtuigID !== undefined && payload.vliegtuigID !== lastSent.sent.vliegtuigID) {
                sendUpdate = true;
            }
            else if (payload.status !== lastSent.sent.status) {
                sendUpdate = true;
            }
            else if (payload.startID !== lastSent.sent.startID) {
                sendUpdate = true;
            }
            else if (Math.abs(payload.flarmData.kalman_altitude_agl - lastSent.sent.flarmData.kalman_altitude_agl) > 50) {
                sendUpdate = true;
            }
            else if (Math.abs(payload.flarmData.kalman_speed - lastSent.sent.flarmData.kalman_speed) > 10) {
                sendUpdate = true;
            }
            else if (Math.abs(payload.flarmData.kalman_climb - lastSent.sent.flarmData.kalman_climb) > 1) {
                sendUpdate = true;
            }
            else if (DateTime.now().diff(lastSent.timestamp).as('minutes') > 5) {
                sendUpdate = true;
            }
        }

        if (sendUpdate)
        {
            this.sendFlarmMessage(payload);

            if (idx < 0) {
                this.lastClientUpdateStore.push(new lastClientUpdate(payload));
            }
            else {
                this.lastClientUpdateStore[idx].sent = payload;
                this.lastClientUpdateStore[idx].timestamp = DateTime.now();
            }
        }
    }

    @OnEvent(WebSocketEvents.OnConnect)
    VerwijderSentData() {
        this.lastClientUpdateStore = [];
    }

    // opbouwen van het flarm bericht en versturen naar de websocket
    sendFlarmMessage(payload:FlarmDataWithStatus)
    {
        const msg = {
            REG_CALL: payload.REG_CALL,
            START_ID: payload.startID,
            VELD_ID: this.heliosInboundService.getVliegveld().ID,
            VLIEGTUIG_ID: payload.vliegtuigID,
            starttijd: payload.starttijd,
            landingstijd: payload.landingstijd,
            flarmID: payload.flarmData.flarmId,
            altitude_agl: payload.flarmData.altitude_agl,
            speed: payload.flarmData.kalman_speed,
            climb: Math.round(10 * payload.flarmData.kalman_climb) /10,
            status: GliderStatus[payload.status],
            ts: Math.round(payload.flarmData.receivedTime.hour * 60 + payload.flarmData.receivedTime.minute + payload.flarmData.receivedTime.second / 60),
        }
      this.eventEmitter.emit(WebSocketEvents.SendFlarmMessage,  msg);
    }

    // Start informatie versturen naar de websocket

    @OnEvent(HeliosEvents.OnStartRecorded)
    handleStartRecordedEvent(startID: number) {
        setTimeout(() => {
            const start = this.heliosInboundService.getStartByID(startID)
            this.publishStart(start);
        }, 1000);
    }

    @OnEvent(HeliosEvents.OnLandedRecorded)
    handleLandingRecordedEvent(startID: number) {
        setTimeout(() => {
            const start:HeliosStartDataset = this.heliosInboundService.getStartByID(startID)
            if (start !== undefined)
                this.publishStart(start);
            else
                this.publishStart( {ID: startID, LANDINGSTIJD: DateTime.now().toFormat('HH:mm')});
        }, 1000);
    }

    publishStart(payload: HeliosStartDataset) {
        const  msg = {
            START_ID: payload.ID,
            STARTTIJD: payload.STARTTIJD,
            LANDINGSTIJD: payload.LANDINGSTIJD,
            OPMERKINGEN: payload.OPMERKINGEN,
        }
        this.eventEmitter.emit(WebSocketEvents.SendStartMessage,  msg);
    }
}
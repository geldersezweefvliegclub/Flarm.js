import {Injectable, Logger} from '@nestjs/common';
import {EventEmitter2, OnEvent} from "@nestjs/event-emitter";
import {FlarmEvents} from "../../shared/FlarmEvents";
import {AprsMessage} from "../../inbound/flarm-ogn/AprsMessage";
import {FlarmDataWithStatus} from "../../processing/processing/processing";
import {WebSocketEvents} from "../../shared/WebSocketEvents";
import {GliderStatus} from "../../shared/GliderStatus";

@Injectable()
export class PegasusService {
    private readonly logger = new Logger(PegasusService.name);

    constructor(private readonly eventEmitter: EventEmitter2) {
    }

    @OnEvent(WebSocketEvents.Publish)
    handleDataReceivedEvent(payload:FlarmDataWithStatus){
        const msg = {
            REG_CALL: payload.REG_CALL,
            START_ID: payload.startID,
            VLIEGTUIG_ID: payload.vliegtuigID,
            altitude_agl: payload.flarmData.altitude_agl,
            speed: payload.flarmData.kalman_speed,
            climb: payload.flarmData.kalman_climb,
            status: GliderStatus[payload.status]
        }
      this.eventEmitter.emit(WebSocketEvents.SendMessage,  msg);
    }
}

import {Injectable, Logger} from '@nestjs/common';
import {OnEvent} from "@nestjs/event-emitter";
import {FlarmEvents} from "../../shared/FlarmEvents";
import {AprsMessage} from "../../inbound/flarm-ogn/AprsMessage";

@Injectable()
export class PegasusService {
    private readonly logger = new Logger(PegasusService.name);

    @OnEvent(FlarmEvents.DataReceived)
    handleDataReceivedEvent(payload:AprsMessage){
       // this.logger.log("PegasusService ", payload);
    }
}

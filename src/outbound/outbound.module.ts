import { Module } from '@nestjs/common';
import { HeliosOutboundService } from './helios/helios-outbound.service';
import { PegasusService } from './pegasus/pegasus.service';
import {ServicesModule} from "../services/services.module";
import { WebsocketGateway } from './pegasus/websocket.gateway';
import {HeliosInboundService} from "../inbound/helios/helios-inbound.service";
import {InboundModule} from "../inbound/inbound.module";

@Module({
  imports: [ServicesModule, InboundModule],
  providers: [HeliosOutboundService, PegasusService, WebsocketGateway]
})
export class OutboundModule {}

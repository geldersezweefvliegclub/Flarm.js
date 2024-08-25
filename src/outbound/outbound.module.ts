import { Module } from '@nestjs/common';
import { HeliosOutboundService } from './helios/helios-outbound.service';
import { PegasusService } from './pegasus/pegasus.service';
import {ServicesModule} from "../services/services.module";
import { WebsocketGateway } from './pegasus/websocket.gateway';

@Module({
  imports: [ServicesModule],
  providers: [HeliosOutboundService, PegasusService, WebsocketGateway]
})
export class OutboundModule {}

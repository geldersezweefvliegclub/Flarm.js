import { Module } from '@nestjs/common';
import { HeliosOutboundService } from './helios/helios-outbound.service';
import { PegasusService } from './pegasus/pegasus.service';
import {ServicesModule} from "../services/services.module";

@Module({
  imports: [ServicesModule],
  providers: [HeliosOutboundService, PegasusService]
})
export class OutboundModule {}

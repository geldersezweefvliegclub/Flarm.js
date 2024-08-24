import { Module } from '@nestjs/common';
import { FlarmOgnService } from './flarm-ogn/flarm-ogn.service';
import {ServicesModule} from "../services/services.module";
import { HeliosInboundService } from './helios/helios-inbound.service';

@Module({
  imports: [ServicesModule],
  exports: [ HeliosInboundService],
  providers: [FlarmOgnService, HeliosInboundService]
})
export class InboundModule {}

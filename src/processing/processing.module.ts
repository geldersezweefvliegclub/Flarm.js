import { Module } from '@nestjs/common';
import {ProcessingService} from "./processing/processing";
import {ServicesModule} from "../services/services.module";
import {HeliosInboundService} from "../inbound/helios/helios-inbound.service";
import {InboundModule} from "../inbound/inbound.module";


@Module({
    imports: [ServicesModule, InboundModule],
    providers: [ProcessingService]
})
export class ProcessingModule {}

import { Module } from '@nestjs/common';
import {ProcessingService} from "./processing";
import {HeliosModule} from "../helios/helios.module";
import {ParsedLogger} from "./parsed-logger";


@Module({
    imports: [HeliosModule],
    providers: [ProcessingService, ParsedLogger]
})
export class ProcessingModule {}

import { Module } from '@nestjs/common';
import {ProcessingService} from "./processing";
import {HeliosModule} from "../helios/helios.module";


@Module({
    imports: [HeliosModule],
    providers: [ProcessingService]
})
export class ProcessingModule {}

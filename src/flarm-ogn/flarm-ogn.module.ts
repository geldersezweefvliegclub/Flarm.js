import { Module } from '@nestjs/common';
import { FlarmOgnService } from './flarm-ogn.service';
@Module({
  providers: [FlarmOgnService]
})
export class FlarmOgnModule {}
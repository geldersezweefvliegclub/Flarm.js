import { Module } from '@nestjs/common';
import { FlarmOgnService } from './flarm-ogn.service';
import { OgnRecorder } from './recorder';

@Module({
  providers: [FlarmOgnService, OgnRecorder]
})
export class FlarmOgnModule {}
import { Module } from '@nestjs/common';
import { HeliosModule } from './helios/helios.module';
import { FlarmOgnModule } from './flarm-ogn/flarm-ogn.module';
import { PegasusModule } from './pegasus/pegasus.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ProcessingModule } from './processing/processing.module';
import { MqttModule } from './mqtt/mqtt.module';
import config from './common/configuration';


@Module({
  imports: [                                    // ConfigModule moet als eerste staan
      ConfigModule.forRoot({
          isGlobal: true,
          load: [config]
      }),
      ScheduleModule.forRoot(),
      HeliosModule,
      FlarmOgnModule,
      PegasusModule,
      EventEmitterModule.forRoot(),
      ProcessingModule,
      MqttModule],
  controllers: [],
  providers: []
})
export class AppModule {}
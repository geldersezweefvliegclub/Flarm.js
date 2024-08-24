import { Module } from '@nestjs/common';
import { InboundModule } from './inbound/inbound.module';
import { OutboundModule } from './outbound/outbound.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from '@nestjs/config';
import { ProcessingModule } from './processing/processing.module';
import { ServicesModule } from './services/services.module';
import config from './config/configuration';


@Module({
  imports: [                                    // ConfigModule moet als eerste staan
      ConfigModule.forRoot({
          isGlobal: true,
          load: [config]
      }),
      InboundModule,
      OutboundModule,
      EventEmitterModule.forRoot(),
      ProcessingModule,
      ServicesModule],
  controllers: [],
  providers: []
})
export class AppModule {}
import { Module } from '@nestjs/common';
import { PegasusService } from './pegasus.service';
import { WebsocketGateway } from './websocket.gateway';
import { HeliosModule } from '../helios/helios.module';

@Module({
  imports: [HeliosModule],
  providers: [PegasusService, WebsocketGateway]
})
export class PegasusModule {}

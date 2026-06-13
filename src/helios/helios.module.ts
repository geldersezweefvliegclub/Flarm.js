import { Module } from '@nestjs/common';
import { HeliosInboundWorker } from './helios-inbound-worker';
import { HeliosOutboundWorker } from './helios-outbound-worker';
import { APIService } from './apiservice/api.service';
import { LoginService } from './apiservice/login.service';
import { VliegtuigenService } from './apiservice/vliegtuigen.service';
import { StartsService } from './apiservice/starts.service';
import { TypesService } from './apiservice/types.service';
import { AanwezigVliegtuigService } from './apiservice/aanwezig-vliegtuig.service';
import { DaginfoService } from './apiservice/daginfo';
import { StorageService } from '../common/storage.service';

@Module({
  providers: [HeliosInboundWorker, HeliosOutboundWorker, APIService, LoginService, VliegtuigenService, StartsService, StorageService, TypesService, AanwezigVliegtuigService, DaginfoService],
  exports: [HeliosInboundWorker, APIService, LoginService, VliegtuigenService, StartsService, TypesService, AanwezigVliegtuigService, DaginfoService]
})
export class HeliosModule {}
import { Module } from '@nestjs/common';
import {HeliosOutboundService} from "../outbound/helios/helios-outbound.service";
import {PegasusService} from "../outbound/pegasus/pegasus.service";
import {APIService} from "./apiservice/api.service";
import {LoginService} from "./apiservice/login.service";
import {VliegtuigenService} from "./apiservice/vliegtuigen.service";
import {StorageService} from "./storage/storage.service";
import {StartsService} from "./apiservice/starts.service";
import {TypesService} from "./apiservice/types.service";
import {AanwezigVliegtuigService} from "./apiservice/aanwezig-vliegtuig.service";
import {DaginfoService} from "./apiservice/daginfo";



@Module({
    providers: [APIService,LoginService,VliegtuigenService, StartsService , StorageService, TypesService, AanwezigVliegtuigService, DaginfoService],
    exports:[APIService,LoginService,VliegtuigenService, StartsService, TypesService, AanwezigVliegtuigService, DaginfoService]
})
export class ServicesModule {}

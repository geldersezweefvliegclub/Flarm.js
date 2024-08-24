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



@Module({
    providers: [APIService,LoginService,VliegtuigenService, StartsService , StorageService, TypesService, AanwezigVliegtuigService],
    exports:[APIService,LoginService,VliegtuigenService, StartsService, TypesService, AanwezigVliegtuigService]
})
export class ServicesModule {}

import {Injectable} from "@nestjs/common";
import {HeliosType, HeliosTypes} from "../../types/Helios";
import {StorageService} from "../storage/storage.service";
import {KeyValueArray} from "../../utils/utils";
import {APIService} from "./api.service";
import {LoginService} from "./login.service";


@Injectable()
export class TypesService {
    private typesCache: HeliosTypes = { dataset: []};        // return waarde van API call

    constructor(private readonly apiService: APIService,
                private readonly loginService: LoginService,
                private readonly storageService: StorageService) {
    }

    async getTypes(params: KeyValueArray = {}): Promise<HeliosType[]> {

        if (this.typesCache === undefined) {
            this.typesCache = this.storageService.ophalen('types');
        }

        // kunnen alleen data ophalen als we ingelogd zijn
        if (!this.loginService.isIngelogd()) {
            return (this.typesCache === undefined) ? this.typesCache?.dataset as HeliosType[] : [];
        }

        if ((this.typesCache != undefined)  && (this.typesCache.hash != undefined)) { // we hebben eerder de lijst opgehaald
            params['HASH'] = this.typesCache.hash;
        }

        try {
            const response = await this.apiService.get('Types/GetObjects', params);
            this.typesCache = await response.json();
            this.storageService.opslaan('types', this.typesCache);
        } catch (e) {
            if ((e.responseCode !== 304) && (e.responseCode !== 704)) { // server bevat dezelfde starts als cache
                console.error(`Exception in types.service.getTypes: ${e}`);
            }
        }
        return this.typesCache?.dataset as HeliosType[];
    }
}

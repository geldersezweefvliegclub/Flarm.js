import {Injectable} from "@nestjs/common";
import {HeliosDagInfo, HeliosDagInfosDataset, HeliosStart, HeliosStartDataset, HeliosStarts} from "../../types/Helios";
import {KeyValueArray} from "../../utils/utils";
import {APIService} from "./api.service";
import {StorageService} from "../storage/storage.service";
import {LoginService} from "./login.service";
import {DateTime} from "luxon";

@Injectable()
export class DaginfoService {
    private dagInfoCache: HeliosStarts = undefined;     // return waarde van API call

    constructor(private readonly apiService: APIService,
                private readonly loginService: LoginService,
                private readonly storageService: StorageService) {}

    async getDagInfo(): Promise<HeliosDagInfosDataset | undefined> {
        let getParams: KeyValueArray = {};

        if (this.dagInfoCache === undefined) {
            this.dagInfoCache = this.storageService.ophalen('daginfo');
        }

        // kunnen alleen data ophalen als we ingelogd zijn
        if (!this.loginService.isIngelogd()) {
            if (this.dagInfoCache === undefined)
            {
                return undefined;
            }
            else
            {
                const ds = this.dagInfoCache?.dataset as HeliosDagInfosDataset[];
                return (ds.length > 0) ? ds[0] : undefined;
            }
        }

        if ((this.dagInfoCache != undefined)  && (this.dagInfoCache.hash != undefined)) { // we hebben eerder de lijst opgehaald
            getParams['HASH'] = this.dagInfoCache.hash
        }

        getParams['DATUM'] = DateTime.now().toISODate();

        try {
            const response: Response = await this.apiService.get('Daginfo/GetObjects', getParams);
            this.dagInfoCache = await response.json();
            this.storageService.opslaan('daginfo', this.dagInfoCache);
        } catch (e) {
            if ((e.responseCode !== 304) && (e.responseCode !== 704)) { // server bevat dezelfde starts als cache
                console.error(`Exception in starts.service.getStarts: ${e}`);
            }
        }
        const ds = this.dagInfoCache?.dataset as HeliosDagInfosDataset[];
        return (ds.length > 0) ? ds[0] : undefined;
    }
}

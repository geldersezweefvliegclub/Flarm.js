import {Injectable} from "@nestjs/common";
import {HeliosVliegtuig, HeliosVliegtuigen, HeliosVliegtuigenDataset} from "../../types/Helios";
import {KeyValueArray} from "../../utils/utils";
import {APIService} from "./api.service";
import {StorageService} from "../storage/storage.service";
import {LoginService} from "./login.service";


@Injectable()
export class VliegtuigenService {
    private vliegtuigenCache: HeliosVliegtuigen = undefined;     // return waarde van API call

    constructor(private readonly apiService: APIService,
                private readonly loginService: LoginService,
                private readonly storageService: StorageService) {}

    async getVliegtuigen(verwijderd: boolean = false, zoekString?: string, params: KeyValueArray = {}): Promise<HeliosVliegtuigenDataset[]> {
        let getParams: KeyValueArray = params;

        if (this.vliegtuigenCache === undefined) {
            this.vliegtuigenCache = this.storageService.ophalen('vliegtuigen');
        }

        // kunnen alleen data ophalen als we ingelogd zijn
        if (!this.loginService.isIngelogd()) {
            return (this.vliegtuigenCache === undefined) ? this.vliegtuigenCache?.dataset as HeliosVliegtuigenDataset[] : [];
        }

        if ((this.vliegtuigenCache != undefined)  && (this.vliegtuigenCache.hash != undefined)) { // we hebben eerder de lijst opgehaald
            getParams['HASH'] = this.vliegtuigenCache.hash
        }
        if (zoekString) {
            getParams['SELECTIE'] = zoekString;
        }

        if (verwijderd) {
            getParams['VERWIJDERD'] = "true";
        }

        try {
            const response: Response = await this.apiService.get('Vliegtuigen/GetObjects', getParams);
            this.vliegtuigenCache = await response.json();
            this.storageService.opslaan('vliegtuigen', this.vliegtuigenCache);
        } catch (e) {
            if ((e.responseCode !== 304) && (e.responseCode !== 704)) { // server bevat dezelfde starts als cache
                throw(e);
            }
        }
        return this.vliegtuigenCache?.dataset as HeliosVliegtuigenDataset[];
    }
}

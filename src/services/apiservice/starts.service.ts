import {Injectable} from "@nestjs/common";
import {HeliosStart, HeliosStartDataset, HeliosStarts} from "../../types/Helios";
import {KeyValueArray} from "../../utils/utils";
import {APIService} from "./api.service";
import {StorageService} from "../storage/storage.service";
import {LoginService} from "./login.service";


@Injectable()
export class StartsService {
    private startsCache: HeliosStarts = undefined;     // return waarde van API call

    constructor(private readonly apiService: APIService,
                private readonly loginService: LoginService,
                private readonly storageService: StorageService) {}

    async getStarts(verwijderd: boolean = false, zoekString?: string, params: KeyValueArray = {}): Promise<HeliosStartDataset[]> {
        let getParams: KeyValueArray = params;

        if (this.startsCache === undefined) {
            this.startsCache = this.storageService.ophalen('starts');
        }

        // kunnen alleen data ophalen als we ingelogd zijn
        if (!this.loginService.isIngelogd()) {
            return  (this.startsCache === undefined) ? this.startsCache?.dataset as HeliosStartDataset[] : [];
        }

        if ((this.startsCache != undefined)  && (this.startsCache.hash != undefined)) { // we hebben eerder de lijst opgehaald
            getParams['HASH'] = this.startsCache.hash
        }
        if (zoekString) {
            getParams['SELECTIE'] = zoekString;
        }

        if (verwijderd) {
            getParams['VERWIJDERD'] = "true";
        }

        try {
            const response: Response = await this.apiService.get('Startlijst/GetObjects', getParams);
            this.startsCache = await response.json();
            this.storageService.opslaan('starts', this.startsCache);
        } catch (e) {
            if ((e.responseCode !== 304) && (e.responseCode !== 704)) { // server bevat dezelfde starts als cache
                throw(e);
            }
        }
        return this.startsCache?.dataset as HeliosStartDataset[];
    }
    async getStart(id: number): Promise<HeliosStart> {
        // kunnen alleen data ophalen als we ingelogd zijn
        if (!this.loginService.isIngelogd()) {
            return {};
        }
        const response: Response = await this.apiService.get('Startlijst/GetObject', {'ID': id.toString()});
        return response.json();
    }

    async updateStart(start: HeliosStart) {
        const replacer = (key:string, value:any) =>
            typeof value === 'undefined' ? null : value;

        const response: Response = await this.apiService.put('Startlijst/SaveObject', JSON.stringify(start, replacer));

        return response.json();
    }
}

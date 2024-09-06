import {Injectable} from "@nestjs/common";
import {APIService} from "./api.service";
import {DateTime} from "luxon";
import {KeyValueArray} from "../../utils/utils";
import {HeliosAanwezigVliegtuigen, HeliosType, HeliosTypes} from "../../types/Helios";
import {StorageService} from "../storage/storage.service";
import {LoginService} from "./login.service";


@Injectable()
export class AanwezigVliegtuigService {

    private aangemeldCache: HeliosAanwezigVliegtuigen = { dataset: []};        // return waarde van API call

    constructor(private readonly apiService: APIService,
                private readonly loginService: LoginService,
                private readonly storageService: StorageService) {
    }

    async getAanwezig(params: KeyValueArray = {}): Promise<HeliosType[]> {

        if (this.aangemeldCache === undefined) {
            this.aangemeldCache = this.storageService.ophalen('aanmeldingen');
        }

        // kunnen alleen data ophalen als we ingelogd zijn
        if (!this.loginService.isIngelogd()) {
            return (this.aangemeldCache === undefined) ? this.aangemeldCache?.dataset as HeliosType[] : [];
        }

        if ((this.aangemeldCache != undefined)  && (this.aangemeldCache.hash != undefined)) { // we hebben eerder de lijst opgehaald
            params['HASH'] = this.aangemeldCache.hash;
        }

        try {
            const response = await this.apiService.get('Types/GetObjects', params);
            this.aangemeldCache = await response.json();
            this.storageService.opslaan('types', this.aangemeldCache);
        } catch (e) {
            if ((e.responseCode !== 304) && (e.responseCode !== 704)) { // server bevat dezelfde starts als cache
                console.error(`Exception in types.service.getTypes: ${e}`);
            }
        }
        return this.aangemeldCache?.dataset as HeliosType[];
    }

    // is het vliegtuig reeds aangeneld ?
    isAangemeld(vliegtuigID: number): boolean {
        if (this.aangemeldCache === undefined) {
            return false;
        }

        const idx = this.aangemeldCache.dataset.findIndex((vliegtuig) => vliegtuig.ID === vliegtuigID);
        return idx !== -1;
    }


    async aanmelden(datum: DateTime, vliegtuigID: number, vliegveld: number|undefined): Promise<any> {
        const record = {
            VLIEGTUIG_ID: vliegtuigID,
            VELD_ID: vliegveld,
            DATUM: datum.toISODate()
        }
        try {
            const response: Response = await this.apiService.post('AanwezigVliegtuigen/Aanmelden', JSON.stringify(record));
            return response.json();

            this.aangemeldCache.dataset.push(record);
        }
        catch (e) {
            console.error(`Exception in aanwezig-vliegtuig.service.aanmelden: ${e}`);
        }
    }
}
import {Injectable} from "@nestjs/common";
import {APIService} from "./api.service";
import {DateTime} from "luxon";


@Injectable()
export class AanwezigVliegtuigService {

    constructor(private readonly apiService: APIService) {
    }

    async aanmelden(datum: DateTime, vliegtuigID: number, vliegveld: number|undefined): Promise<any> {
        const record = {
            VLIEGTUIG_ID: vliegtuigID,
            VELD_ID: vliegveld,
            DATUM: datum.year + "-" + datum.month + "-" + datum.day
        }
        const response: Response = await this.apiService.post('AanwezigVliegtuigen/Aanmelden', JSON.stringify(record));
        return response.json();
    }

}
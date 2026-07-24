
import {KeyValueArray} from "../../common/utils";
import {ConfigService} from "@nestjs/config";
import {Injectable, Logger} from "@nestjs/common";
import {EventEmitter2} from "@nestjs/event-emitter";
import {HeliosEvents} from "../../shared/HeliosEvents";

@Injectable()
export class APIService {
    private readonly logger = new Logger(APIService.name);
    private readonly URL:string = 'http://localhost:4200/api/'
    private BearerToken: string | null = null;

    constructor(private readonly configService: ConfigService,
                private readonly eventEmitter: EventEmitter2) {

        const url = configService.get('Helios.url');
        if (url) this.URL = url;

        if (!this.URL.endsWith('/')) {
            this.URL += '/';
        }
    }

    // opslaan van de token die we met inloggen hebben vekregen
    async setBearerToken(token?: string) {
        this.BearerToken = (token) ? token : null;
    }

    async get(url: string, params?: KeyValueArray, headers?: Headers): Promise<Response> {
        if (params) {
            url = this.prepareEndpoint(url, params);
        }

        const apiHeaders: Headers =  (headers) ? headers : new Headers();
        if (!apiHeaders?.has('Authorization') && this.BearerToken) {
            apiHeaders.append('Authorization', "Bearer " + this.BearerToken);
        }
        else
        {
            if (!url.toLowerCase().includes('login')) {
                this.logger.warn(`Unauthorized, ${url}`);
            }
        }

        const heliosUrl  = this.URL + url;
        this.logger.verbose(`GET ${heliosUrl}`);

        const response = await fetch(heliosUrl, {
            method: 'GET',
            headers: apiHeaders,
            credentials: 'include'
        });

        if (!response.ok) {
            this.handleError(response, heliosUrl);
        }
        return response;
    }

    // Aanroepen post request om het aanmaken van nieuw record
    // Dit is een string voor JSON, of FormData voor foto's
    async post(url: string, body: string|FormData, headers?: Headers): Promise<Response> {
        const apiHeaders: Headers =  (headers) ? headers : new Headers();
        if (!apiHeaders?.has('Authorization') && this.BearerToken) {
            apiHeaders.append('Authorization', "Bearer " + this.BearerToken);
        }
        const heliosUrl = `${this.URL}${url}`;
        const response = await fetch(heliosUrl, {
            method: 'POST',
            headers: apiHeaders,
            body: body,
            credentials: 'include'
        });
        //todo response heeft een .ok property. Mogelijk beter te gebruiken? (Zoals get())
        if (response.status != 200) {  // 200 is normaal voor post
            this.handleError(response, heliosUrl, body);
        }

        return response;
    }

    // Aanroepen put request om record te wijzigen
    async put(url: string, body: string, headers?: Headers): Promise<Response> {

        const apiHeaders: Headers =  (headers) ? headers : new Headers();
        if (!apiHeaders?.has('Authorization') && this.BearerToken) {
            apiHeaders.append('Authorization', "Bearer " + this.BearerToken);
        }
        const heliosUrl = `${this.URL}${url}`;
        const response = await fetch(heliosUrl, {
            method: 'PUT',
            headers: apiHeaders,
            body: body,
            credentials: 'include'
        });
        // todo .ok property gebruiken?
        if (response.status != 200) {  // 200 is normaal voor put
            this.handleError(response, heliosUrl, body);
        }
        return response;
    }

    // Aanroepen delete request om record te verwijderen
    async delete(url: string, params: KeyValueArray): Promise<void> {
        if (params) {
            url = this.prepareEndpoint(url, params);
        }

        const apiHeaders: Headers = new Headers();
        if (!apiHeaders?.has('Authorization') && this.BearerToken) {
            apiHeaders.append('Authorization', "Bearer " + this.BearerToken);
        }

        const heliosUrl = `${this.URL}${url}`;
        const response = await fetch(heliosUrl, {
            method: 'DELETE',
            headers: apiHeaders,
            credentials: 'include'
        });
        // todo .ok gebruiken?
        if (response.status != 204) { // 204 is normaal voor delete
            this.handleError(response, heliosUrl);
        }
    }

    // Aanroepen patch request om verwijderen record ongedaan te maken
    async patch(url: string, params: KeyValueArray): Promise<void> {
        if (params) {
            url = this.prepareEndpoint(url, params);
        }

        const apiHeaders: Headers = new Headers();
        if (!apiHeaders?.has('Authorization') && this.BearerToken) {
            apiHeaders.append('Authorization', "Bearer " + this.BearerToken);
        }

        const heliosUrl = `${this.URL}${url}`;
        const response = await fetch(heliosUrl, {
            method: 'PATCH',
            headers: apiHeaders,
            credentials: 'include'
        });

        // todo .ok gebruiken?
        if (response.status != 202) { // 204 is normaal voor patch
            this.handleError(response, heliosUrl);
        }
    }

    private prepareEndpoint(url: string, params: KeyValueArray): string {
        let args: string = "";

        // Loop vervolgens door het key:value object heen
        // Als het object op index 0 is, voeg vraagteken toe. Als object niet op de laatste plek staat, voeg & toe.
        Object.entries(params).forEach(([key, value]) => {
            if (args == "") {
                args = args.concat('?');
            } else {
                args = args.concat('&');
            }
            args = args.concat(`${key}=${value}`)
        })

        return url + args;
    }


    // Vul customer error  met http status code en de beschrijving uit X-Error-Message
    private handleError(response: Response, url: string, body?: string|FormData): void {
        let beschrijving = response.headers.get('X-Error-Message')      // Helios implementaie fout melding

        const error: any = {
            responseCode: response.status,
            beschrijving: beschrijving,
            url: url,
            body: body
        }

        const errorMsg = `API call failed with status ${response.status} ${response.statusText} ${beschrijving} - URL: ${url}${body ? ` - Body: ${body}` : ''}`;
        if (response.status !== 304) {
            this.logger.error(errorMsg);
        }

        // Helios geeft 501 terug als de sessie/token niet meer geldig is; elke volgende aanroep zou
        // dan ook blijven falen. We negeren dit voor de login-endpoints zelf (anders zou een falende
        // Login/Login of Login/Relogin-aanroep, tijdens een Helios-storing, zichzelf blijven
        // triggeren) en laten voor alle andere aanroepen LoginService weten dat er opnieuw
        // ingelogd moet worden.
        if (response.status === 501 && !url.toLowerCase().includes('login')) {
            this.eventEmitter.emit(HeliosEvents.SessionExpired);
        }

        throw error;
    }
}

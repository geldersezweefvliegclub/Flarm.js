
import {KeyValueArray} from "../../common/utils";
import {ConfigService} from "@nestjs/config";
import {Injectable, Logger} from "@nestjs/common";
import {EventEmitter2} from "@nestjs/event-emitter";
import {HeliosEvents} from "../../shared/HeliosEvents";

@Injectable()
export class APIService {
    // query-parameter namen die nooit in plaintext gelogd mogen worden (bv. het Helios-sessietoken
    // dat Login/Login als query-parameter meekrijgt, zie login.service.ts)
    private static readonly SENSITIVE_PARAM_NAMES = ['token', 'password', 'wachtwoord', 'secret', 'apikey', 'api_key'];

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
        this.logger.verbose(`GET ${this.redactSensitiveParams(heliosUrl)}`);

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

    // Zorgt dat gevoelige query-parameters (token, wachtwoord, ...) niet in plaintext in de logs
    // terechtkomen (bv. via een externe Seq-log-server). Overige parameters (ID's, datums, ...)
    // blijven zichtbaar, want die zijn vaak nuttig bij het debuggen van een falende aanroep.
    private redactSensitiveParams(url: string): string {
        const [path, query] = url.split('?');
        if (!query) return url;

        const redactedQuery = query.split('&').map((pair) => {
            const [key] = pair.split('=');
            const isSensitive = APIService.SENSITIVE_PARAM_NAMES.includes(key.toLowerCase());
            return isSensitive ? `${key}=***` : pair;
        }).join('&');

        return `${path}?${redactedQuery}`;
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
        const redactedUrl = this.redactSensitiveParams(url);

        const error: any = {
            responseCode: response.status,
            beschrijving: beschrijving,
            url: redactedUrl,
            body: body
        }

        const errorMsg = `API call failed with status ${response.status} ${response.statusText} ${beschrijving} - URL: ${redactedUrl}${body ? ` - Body: ${body}` : ''}`;
        if (response.status !== 304) {
            this.logger.error(errorMsg);
        }

        // Helios geeft 501 terug als de sessie/token niet meer geldig is; elke volgende aanroep zou
        // dan ook blijven falen. We negeren dit alleen voor Login/Login zelf (dat is de aanroep die
        // de recovery hieronder gebruikt om opnieuw in te loggen; zou die zelf ook met 501 falen
        // tijdens een Helios-storing, dan zou hij zichzelf blijven triggeren). Login/Relogin telt
        // hier NIET als login-endpoint: dat is precies de aanroep die keepHeliosAlive() elke 10
        // minuten doet, en een 501 daarop is het signaal dat de sessie dood is en er via een
        // volledige login (LoginService.login()) opnieuw ingelogd moet worden.
        if (response.status === 501 && !url.toLowerCase().includes('login/login')) {
            this.eventEmitter.emit(HeliosEvents.SessionExpired);
        }

        throw error;
    }
}

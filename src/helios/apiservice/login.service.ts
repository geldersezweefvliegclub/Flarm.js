
import {Base64} from 'js-base64';
import {APIService} from   "./api.service";
import {ConfigService} from "@nestjs/config";
import {Injectable, Logger} from "@nestjs/common";
import {OnEvent} from "@nestjs/event-emitter";
import {HeliosEvents} from "../../shared/HeliosEvents";

interface BearerToken {
    TOKEN: string;
}

@Injectable()
export class LoginService  {
    private readonly logger = new Logger(LoginService.name);
    isLoggedIn: boolean = false;
    private reloginInProgress = false;   // voorkomt dat meerdere gelijktijdig falende aanroepen elk apart opnieuw inloggen

    constructor(private readonly configService: ConfigService,
                private readonly apiService: APIService) { }

    async login(): Promise<boolean> {
        const HeliosConfig = this.configService.get('Helios');
        const gebruikersnaam = HeliosConfig.username;
        const wachtwoord = HeliosConfig.password;
        const token = HeliosConfig.token;

        const headers = new Headers(
            {
                'Authorization': 'Basic ' + Base64.encode(`${gebruikersnaam}:${wachtwoord}`)
            });

        let params: any;
        if ((token) && (token !== "")) {
            params = {'token': token as string}
        }

        const response: Response = await this.apiService.get('Login/Login', params, headers);

        if (response.ok) {
            const login: BearerToken = await response.json();
            this.apiService.setBearerToken(login.TOKEN);
            this.isLoggedIn = true;
            return true;
        }
        return false;
    }

    // Haal nieuw token op zodat de sessie alive blijft
    async relogin(): Promise<boolean> {
        try {
            const response: Response = await this.apiService.get('Login/Relogin');
            if (response.ok) {
                const login: BearerToken = await response.json();

                this.apiService.setBearerToken(login.TOKEN);
                this.isLoggedIn = true;
            }
        }
        catch (e) {
            this.apiService.setBearerToken();
            this.isLoggedIn = false;
            return false;
        }
        return true;
    }

    isIngelogd(): boolean {
        return this.isLoggedIn;
    }

    // De Helios-sessie is verbroken (zie APIService.handleError, HTTP 501 op een niet-login-aanroep).
    // Eén nieuwe, volledige login (niet relogin, want de sessie is niet zomaar te verversen) is
    // voldoende om alle volgende API-aanroepen weer te laten werken. Loopt er al een login-poging
    // (bv. omdat meerdere aanroepen rond hetzelfde moment faalden), dan negeren we het dubbele event.
    @OnEvent(HeliosEvents.SessionExpired)
    async handleSessionExpired(): Promise<void> {
        if (this.reloginInProgress)
            return;

        this.reloginInProgress = true;
        this.isLoggedIn = false;
        this.apiService.setBearerToken();   // dode token direct laten vallen, geen requests meer met een ongeldig token

        this.logger.warn('Helios-sessie verbroken (501), opnieuw inloggen...');
        try {
            await this.login();
        }
        catch (e) {
            this.logger.error(`Opnieuw inloggen bij Helios mislukt: ${e?.message ?? e}`);
        }
        finally {
            this.reloginInProgress = false;
        }
    }
}

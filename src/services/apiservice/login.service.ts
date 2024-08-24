import {HeliosUserinfo} from "../../types/Helios";
import {BehaviorSubject} from "rxjs";
import {Base64} from 'js-base64';
import {APIService} from   "./api.service";
import {ConfigService} from "@nestjs/config";
import {Injectable} from "@nestjs/common";

interface BearerToken {
    TOKEN: string;
}

@Injectable()
export class LoginService  {
    isLoggedIn: boolean = false;

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
}

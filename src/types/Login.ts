/**
 * This file was auto-generated by openapi-typescript.
 * Do not make direct changes to the file.
 */

export interface paths {
    "/Login/GetUserInfo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Haal informatie van de ingelogde gebruiker */
        get: {
            parameters: {
                query?: {
                    /** @description De datum waarop isStartleider bepaald is. Indien afwezig, dan de dag van vandaag */
                    DATUM?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK, data succesvol opgehaald */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Userinfo"];
                    };
                };
                /** @description Data niet gevonden */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/Login/Login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Inloggen */
        get: {
            parameters: {
                query?: {
                    /** @description token van SMS of Google Authenticator */
                    token?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK, ingelogd */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["token"];
                    };
                };
                /** @description Mislukt */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Niet aanvaardbaar, input ontbreekt */
                406: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/Login/Relogin": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Inloggen */
        get: {
            parameters: {
                query?: {
                    /** @description bearer token */
                    token?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK, ingelogd */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["token"];
                    };
                };
                /** @description Mislukt */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Niet aanvaardbaar, input ontbreekt */
                406: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/Login/Logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Uitloggen en beeindigen van de sessie */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK, tot de volgende keer */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "//Login/SendSMS": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Verstuur 2 factor security code */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK, SMS is verstuurd */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ref_leden"];
                    };
                };
                /** @description Data niet gevonden */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Niet aanvaardbaar, input ontbreekt */
                406: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Data verwerkingsfout */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "//Login/ResetWachtwoord": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Reset wachtwoord, login naam in basicAuth header */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Aanvraag verwerkt. Ook status 200 als email versturen mislukt is. Dit om te voorkomen dat we te veel info prijsgeven */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Niet aanvaardbaar, input ontbreekt */
                406: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Data verwerkingsfout */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        token: {
            /** @description JSON Web Token - JWT */
            TOKEN?: string;
        };
        ref_leden: {
            /**
             * Format: int32
             * @description Database ID van het lid record
             * @example 12871
             */
            ID?: number;
            /**
             * @description De volledige naam van het lid
             * @example Meindert het Paard
             */
            NAAM?: string;
            /**
             * @description De voornaam van het lid
             * @example Meindert
             */
            VOORNAAM?: string;
            /**
             * @description De tussenvoegsel van het lid
             * @example het
             */
            TUSSENVOEGSEL?: string;
            /**
             * @description De achternaam van het lid zonder tussenvoegsels
             * @example Paard
             */
            ACHTERNAAM?: string;
            /**
             * @description Het (post) adres waar het lid woont
             * @example Werf 18
             */
            ADRES?: string;
            /**
             * @description De postcode die bij het adres hoort
             * @example 7158 PP
             */
            POSTCODE?: string;
            /**
             * @description De plaatsnaam
             * @example Berkum
             */
            WOONPLAATS?: string;
            /**
             * @description Telefoon nummer van het lid
             * @example 086-1506822
             */
            TELEFOON?: string;
            /**
             * @description Mobiel telefoon nummer van het lid
             * @example 06-1025500
             */
            MOBIEL?: string;
            /**
             * @description Het telefoonnummer van een naaste, kan gebruikt worden in noodgevallen
             * @example 0112-11801
             */
            NOODNUMMER?: string;
            /**
             * @description email adres van het lid
             * @example meindert@fabeltje.com
             */
            EMAIL?: string;
            /**
             * @description url naar avatar
             * @example https://mijn.vliegclub.org/avatar.gif
             */
            AVATAR?: string;
            /**
             * @description Het lidnummer zoals dat in de leden administratie bekend is
             * @example 11139
             */
            LIDNR?: string;
            /**
             * Format: int32
             * @description Het soort lid (jeugdlid, lid, donateur). Verwijzing naar type tabel
             * @example 603
             */
            LIDTYPE_ID?: number;
            /**
             * Format: int32
             * @description De vliegstatus van het lid (DBO, solist, brevethouder), NULL indien niet van toepassing
             * @example 1901
             */
            STATUSTYPE_ID?: number;
            /**
             * Format: int32
             * @description Zusterclub lidmaatschap van lid. Nodig voor DDWV.
             * @example 603
             */
            ZUSTERCLUB_ID?: number;
            /**
             * @description Mag dit lid lieren?
             * @example false
             */
            LIERIST?: boolean;
            /**
             * @description Lierist in opleiding
             * @example false
             */
            LIERIST_IO?: boolean;
            /**
             * @description Kan dit lid het startbedrijf leiden?
             * @example true
             */
            STARTLEIDER?: boolean;
            /**
             * @description Heeft dit lid een instructie bevoegdheid?
             * @example false
             */
            INSTRUCTEUR?: boolean;
            /**
             * @description Heeft dit lid een instructie bevoegdheid?
             * @example false
             */
            CIMT?: boolean;
            /**
             * @description Werkt dit lid mee in het DDWV bedrijf
             * @example false
             */
            DDWV_CREW?: boolean;
            /**
             * @description Is dit lid de beheerder van het DDWV bedrijf, heeft toegang tot DDWV gerelateede data
             * @example true
             */
            DDWV_BEHEERDER?: boolean;
            /**
             * @description Is dit lid de beheerder van deze omgeving, heeft toegang tot alles
             * @example true
             */
            BEHEERDER?: boolean;
            /**
             * @description Dit account wordt gebruikt om starts in de start toren in te voeren
             * @example false
             */
            STARTTOREN?: boolean;
            /**
             * @description Is dit lid  belast met het maken van roosters
             * @example false
             */
            ROOSTER?: boolean;
            /**
             * @description Is dit lid ook een sleepvlieger
             * @example false
             */
            SLEEPVLIEGER?: boolean;
            /**
             * @description Moet clubblad per post verstuurd worden
             * @example true
             */
            CLUBBLAD_POST?: boolean;
            /**
             * @description Heeft lid toegang tot alle starts / logboeken voor rapportage
             * @example true
             */
            RAPPORTEUR?: boolean;
            /**
             * @description Wordt dit lid ingedeeld om gasten te vliegen
             * @example true
             */
            GASTENVLIEGER?: boolean;
            /**
             * Format: date
             * @description Verloopdatum van het medical
             * @example 2022-01-16
             */
            MEDICAL?: string;
            /**
             * @description Is lid een technicus voor rollend / vliegend. Zo ja dan extra bevoegdheden in Journaal
             * @example true
             */
            TECHNICUS?: boolean;
            /**
             * Format: date
             * @description Geboorte datum van het lid
             * @example 1932-01-16
             */
            GEBOORTE_DATUM?: string;
            /**
             * @description De inlognaam van het lid
             * @example mpaard
             */
            INLOGNAAM?: string;
            /**
             * @description Het geheime password, bij ophalen van data altijd "****". Wachtwoord wordt als hash opgeslagen in de database
             * @example 123456
             */
            WACHTWOORD?: string;
            /**
             * @description Wachtwoord in Helios hash formaat. Data wordt direct in database opgeslagen zonder encryptie, dat is namelijk al gebeurd. Alleen van toepassing voor SaveObject, komt dus niet terug in GetObject of GetObjects
             * @example 123456
             */
            WACHTWOORD_HASH?: string;
            /**
             * @description 2Factor authenticatie voor deze gebruiker
             * @example true
             */
            AUTH?: boolean;
            /**
             * @description Heef het lid een startverbod?
             * @example false
             */
            STARTVERBOD?: boolean;
            /**
             * @description Staat privacy mode (AVG / GDPR) uit/aan
             * @example true
             */
            PRIVACY?: boolean;
            /**
             * @description Wat zijn de beperkingen (vliegen / diensten) voor dit lid
             * @example Meindert niet inzetten als startleider, hij gaat gras eten :-)
             */
            BEPERKINGEN?: string;
            /**
             * @description Extra text om opmerkingen toe te voegen
             * @example Voorkeur om 's morgens lierdienst te doen
             */
            OPMERKINGEN?: string;
        };
        Userinfo: {
            /** @description Aantal records dat voldoet aan de criteria in de database */
            LidData?: components["schemas"]["ref_leden"];
            /** @description Gebruik dit object voor applicatie permissies */
            Userinfo?: {
                /**
                 * @description Is de ingelogde gebruiker de DDWV beheerder
                 * @example false
                 */
                isBeheerderDDWV?: boolean;
                /**
                 * @description Is de ingelogde gebruiker de applicatie beheerder
                 * @example true
                 */
                isBeheerder?: boolean;
                /**
                 * @description Is de ingelogde gebruiker de rooster maker
                 * @example false
                 */
                isRooster?: boolean;
                /**
                 * @description Is de ingelogde gebruiker een instructeur
                 * @example false
                 */
                isInstructeur?: boolean;
                /**
                 * @description Is de ingelogde gebruiker chef instructeur
                 * @example false
                 */
                isCIMT?: boolean;
                /**
                 * @description Is de ingelogde gebruiker de starttoren?
                 * @example true
                 */
                isStarttoren?: boolean;
                /**
                 * @description Is de ingelogde gebruiker verantwoordelijk voor start rapportage & logboeken
                 * @example true
                 */
                isRapporteur?: boolean;
                /**
                 * @description Maakt de ingelogde gebruiker onderdeel uit van de DDWV crew ?
                 * @example true
                 */
                isDDWVCrew?: boolean;
                /**
                 * @description Is de ingelogde gebruiker aangemeld voor vandaag
                 * @example true
                 */
                isAangemeld?: boolean;
                /**
                 * @description Is de ingelogde gebruiker een lid van de club
                 * @example true
                 */
                isClubVlieger?: boolean;
                /**
                 * @description Is de ingelogde gebruiker een DDWV vlieger (dus geen club lid)
                 * @example false
                 */
                isDDWV?: boolean;
            };
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;

/**
 * This file was auto-generated by openapi-typescript.
 * Do not make direct changes to the file.
 */

export interface paths {
    "/Daginfo/CreateTable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Creeer database objecten */
        post: {
            parameters: {
                query: {
                    /** @description Dummy records aanmaken */
                    FILLDATA: boolean;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Aangemaakt, Tabel toegevoegd */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Data verwerkingsfout, bijv omdat de tabel al bestaat */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/Daginfo/CreateViews": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Creeer database views */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Aangemaakt, View toegevoegd */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Data verwerkingsfout, view niet aangemaak */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/Daginfo/GetObject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Haal een enkel daginfo record op uit de database */
        get: {
            parameters: {
                query?: {
                    /** @description Database ID van het daginfo record */
                    ID?: number;
                    /** @description Datum van de daginfo */
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
                        "application/json": components["schemas"]["oper_daginfo"];
                    };
                };
                /** @description Data niet gevonden */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Methode niet toegestaan, input validatie error */
                405: {
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
                /** @description Data verwerkingsfout, bijv onjuiste veldwaarde (string ipv integer) */
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
    "/Daginfo/GetObjects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Haal een lijst met vliegdagen op uit de database */
        get: {
            parameters: {
                query?: {
                    /** @description Database ID van het aanwezig record */
                    ID?: number;
                    /** @description Toon welke records verwijderd zijn. Default = false */
                    VERWIJDERD?: boolean;
                    /** @description Laatste aanpassing op basis van records in dataset. Bedoeld om data verbruik te verminderen. Dataset is daarom leeg */
                    LAATSTE_AANPASSING?: boolean;
                    /** @description HASH van laatste GetObjects aanroep. Indien bij nieuwe aanroep dezelfde data bevat, dan volgt http status code 304. In geval dataset niet hetzelfde is, dan komt de nieuwe dataset terug. Ook bedoeld om dataverbruik te vermindereren. Er wordt alleen data verzonden als het nodig is. */
                    HASH?: string;
                    /** @description Sortering van de velden in ORDER BY formaat. Default = DATUM DESC */
                    SORT?: string;
                    /** @description Maximum aantal records in de dataset. Gebruikt in LIMIT query */
                    MAX?: number;
                    /** @description Eerste record in de dataset. Gebruikt in LIMIT query */
                    START?: number;
                    /** @description Welke velden moet opgenomen worden in de dataset */
                    VELDEN?: string;
                    /** @description Zoek op datum */
                    DATUM?: string;
                    /** @description Begin datum (inclusief deze dag) */
                    BEGIN_DATUM?: string;
                    /** @description Eind datum (inclusief deze dag) */
                    EIND_DATUM?: string;
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
                        "application/json": components["schemas"]["view_daginfo"];
                    };
                };
                /** @description Data niet gemodificeerd, HASH in aanroep == hash in dataset */
                304: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Methode niet toegestaan, input validatie error */
                405: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Data verwerkingsfout, bijv onjuiste veldwaarde (string ipv integer) */
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
    "/Daginfo/DeleteObject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Verwijder daginfo record */
        delete: {
            parameters: {
                query?: {
                    /** @description Database ID van het daginfo record. Meerdere ID's in CSV formaat */
                    ID?: string;
                    /** @description Datum van de daginfo */
                    DATUM?: string;
                    /** @description Controleer of record bestaat voordat het verwijderd wordt. Default = true */
                    VERIFICATIE?: boolean;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Daginfo verwijderd */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Niet geautoriseerd, geen schrijfrechten */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Data niet gevonden */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Methode niet toegestaan, input validatie error */
                405: {
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
                /** @description Data verwerkingsfout, bijv onjuiste veldwaarde (string ipv integer) */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/Daginfo/RestoreObject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Record dat verwijderd is terug halen. VERWIJDERD marker krijgt reset */
        patch: {
            parameters: {
                query: {
                    /** @description Database ID van het record. Meerdere ID's in CSV formaat */
                    ID: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Record(s) hersteld */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Niet geautoriseerd, geen schrijfrechten */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Data niet gevonden */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Methode niet toegestaan, input validatie error */
                405: {
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
                /** @description Data verwerkingsfout, bijv onjuiste veldwaarde (string ipv integer) */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        trace?: never;
    };
    "/Daginfo/SaveObject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Update bestaand daginfo record */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            /** @description Daginfo data */
            requestBody: {
                content: {
                    "application/json": components["schemas"]["oper_daginfo_in"];
                };
            };
            responses: {
                /** @description OK, data succesvol aangepast */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["oper_daginfo"];
                    };
                };
                /** @description Niet geautoriseerd, geen schrijfrechten */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Data niet gevonden */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Methode niet toegestaan, input validatie error */
                405: {
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
                /** @description Conflict, datum bestaat al */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Data verwerkingsfout, bijv onjuiste veldwaarde (string ipv integer) */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        /** Voeg nieuw daginfo record toe */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            /** @description Daginfo data */
            requestBody: {
                content: {
                    "application/json": components["schemas"]["oper_daginfo_in"];
                };
            };
            responses: {
                /** @description OK, data succesvol toegevoegd */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["oper_daginfo"];
                    };
                };
                /** @description Niet geautoriseerd, geen schrijfrechten */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Methode niet toegestaan, input validatie error */
                405: {
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
                /** @description Conflict, datum bestaat al */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Data verwerkingsfout, bijv onjuiste veldwaarde (string ipv integer) */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
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
        oper_daginfo_in: {
            /**
             * Format: int32
             * @description Database ID van het daginfo record
             * @example 12871
             */
            ID?: number;
            /**
             * Format: date
             * @description Datum van de vliegdag
             * @example 2017-07-21
             */
            DATUM?: string;
            /**
             * Format: int32
             * @description Welke vliegveld vliegen we vandaag als de thuis basis
             * @example 901
             */
            VELD_ID?: number;
            /**
             * Format: int32
             * @description Welke baan is nu actief
             * @example 102
             */
            BAAN_ID?: number;
            /**
             * Format: int32
             * @description De standard startmethode voor deze dag
             * @example 550
             */
            STARTMETHODE_ID?: number;
            /**
             * Format: int32
             * @description Welke vliegveld vliegen we vandaag voor een (buitenland) kamp
             * @example 901
             */
            VELD_ID2?: number;
            /**
             * Format: int32
             * @description Welke baan is nu actief
             * @example 102
             */
            BAAN_ID2?: number;
            /**
             * Format: int32
             * @description De standard startmethode voor deze dag
             * @example 550
             */
            STARTMETHODE_ID2?: number;
            /**
             * @description Is het een DDWV dag?
             * @example 0
             */
            DDWV?: boolean;
            /**
             * @description Is er een clubbedrijf
             * @example 1
             */
            CLUB_BEDRIJF?: boolean;
            /**
             * @description Incidenten om iets van te leren
             * @example Scherpe uitstekels aan lierkabel
             */
            INCIDENTEN?: string;
            /**
             * @description Beschrijving van de situatie op het veld
             * @example Het vliegbedrijf bevatte de volgende aspect(en), lier, sleep en zelfstart op de 22R met een rechterhand circuit. Halverwege de dag omgesteld naar 27C
             */
            VLIEGBEDRIJF?: string;
            /**
             * @description Beschrijving van de weerscondities
             * @example Het zicht was > 10 km. De windrichting was 270 met  windkracht 3.4 - 5.42 m/s. Er was 2/8 bewolking. De wolkenbasis was 800 meter hoog.
             */
            METEO?: string;
            /**
             * @description Aanwezigheid van functionarissen
             * @example Jan, Maartje, Mohammed aanwezig. Klaas had zich verslapen en kwam om 11:00
             */
            DIENSTEN?: string;
            /**
             * @description Kort veslag van de dag
             * @example Rustige dag met een klein ploegje mensen ondanks het prachtige weer. Omstellen ging zonder problemen, vliegende kisten konden blijven hangen
             */
            VERSLAG?: string;
            /**
             * @description Opmerkingen over het rollend materieel
             * @example De motor van de lier wordt warm
             */
            ROLLENDMATERIEEL?: string;
            /**
             * @description Opmerkingen over de vloot
             * @example De E11 is in de werkplaats gezet ivm lekke band. Wordt maandag opgelost
             */
            VLIEGENDMATERIEEL?: string;
        };
        oper_daginfo: components["schemas"]["oper_daginfo_in"] & {
            /**
             * @description Is dit record gemarkeerd als verwijderd?
             * @example 0
             */
            VERWIJDERD?: boolean;
            /**
             * Format: date-time
             * @description Tijdstempel van laaste aanpassing in de database, laat leeg bij updates
             * @example 2010-04-13 19:32:17
             */
            LAATSTE_AANPASSING?: string;
        };
        view_daginfo_dataset: components["schemas"]["oper_daginfo"] & {
            /**
             * @description Verkorte naam van het vliegveld
             * @example EHTL
             */
            VELD_CODE?: string;
            /**
             * @description Naam van het vliegveld
             * @example Terlet
             */
            VELD_OMS?: string;
            /**
             * @description Verkorte beschrijving start strip
             * @example 22R
             */
            BAAN_CODE?: string;
            /**
             * @description beschrijving start strip
             * @example RWY 22
             */
            BAAN_OMS?: string;
            /**
             * @description Verkorte naam van het vliegveld
             * @example EHTL
             */
            VELD_CODE2?: string;
            /**
             * @description Naam van het vliegveld
             * @example Terlet
             */
            VELD_OMS2?: string;
            /**
             * @description Verkorte beschrijving start strip
             * @example 22R
             */
            BAAN_CODE2?: string;
            /**
             * @description beschrijving start strip
             * @example RWY 22R
             */
            BAAN_OMS2?: string;
            /**
             * @description Verkorte naam van de club die leiding heeft over vliegbedrijf
             * @example gezc
             */
            BEDRIJF_CODE?: string;
            /**
             * @description Club die leiding heeft over vliegbedrijf
             * @example GeZC
             */
            BEDRIJF_OMS?: string;
            /**
             * @description De verkorte beschrijving van de meest gebruikte startmethode
             * @example Lier
             */
            STARTMETHODE_CODE?: string;
            /**
             * @description Beschrijving van de meest gebruikte startmethode
             * @example Lierstart
             */
            STARTMETHODE_OMS?: string;
        };
        view_daginfo: {
            /**
             * Format: int32
             * @description Aantal records dat voldoet aan de criteria in de database
             * @example 287
             */
            totaal?: number;
            /**
             * Format: date-time
             * @description Tijdstempel van laaste aanpassing in de database van de records dat voldoet aan de criteria
             * @example 2020-09-01 06:00:05
             */
            laatste_aanpassing?: string;
            /**
             * @description hash van de dataset
             * @example ddaab00
             */
            hash?: string;
            /** @description De dataset met records */
            dataset?: components["schemas"]["view_daginfo_dataset"][];
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

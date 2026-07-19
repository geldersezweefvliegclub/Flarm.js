# Flarm.js

Flarm.js ontvangt live posities van zweefvliegtuigen via het OGN/APRS-netwerk (Flarm),
leidt daaruit per vliegtuig de vluchtstatus af (opstijgen, vliegen, circuit, landen, geland),
en houdt de startlijst van [Helios](#helios) (de start administratiesoftware) automatisch
up-to-date: starttijd, landingstijd, startmethode (lier/sleep/zelfstart) en sleephoogte.
Daarnaast stuurt de applicatie live updates naar een front-end ("Pegasus") via websockets.

De applicatie is gebouwd op [NestJS](https://nestjs.com/) en is volledig event-driven: de
verschillende onderdelen praten niet rechtstreeks met elkaar, maar via events op de
NestJS `EventEmitter2` event-bus. Zie [Events](#events) hieronder voor het overzicht.

## Inhoudsopgave

- [Architectuur](#architectuur)
- [Compileren en draaien](#compileren-en-draaien)
- [Configuratie](#configuratie)
- [Events](#events)
- [Dataflow (samenvatting)](#dataflow-samenvatting)
- [Logging en data-opname](#logging-en-data-opname)
- [Testen](#testen)

## Architectuur

| Module (`src/...`) | Verantwoordelijkheid |
|---|---|
| `flarm-ogn/` | Verbinding met de APRS/OGN-server, parsen van Flarm-berichten, Kalman-filtering per vliegtuig, en (optioneel) een simulator die eerder opgenomen sessies afspeelt. Zie `flarm-ogn.service.ts`. |
| `processing/` | De kern van de applicatie: de statusmachine die per vliegtuig bepaalt of het aan het opstijgen/vliegen/landen is (`processing.ts`), en het wegschrijven van verwerkte data (`parsed-logger.ts`). |
| `helios/` | Communicatie met de Helios-API: inloggen, de startlijst/vliegtuigenlijst periodiek ophalen en lokaal cachen (`helios-inbound-worker.ts`), en wijzigingen (starttijd, landingstijd, sleephoogte, ...) terugschrijven naar Helios (`helios-outbound-worker.ts`). `apiservice/` bevat de losse HTTP-clients per Helios-endpoint. |
| `mqtt/` | Luistert op een MQTT-broker waarop Helios wijzigingen publiceert (push), als aanvulling op de periodieke polling in `helios/` (`mqtt.service.ts`). |
| `pegasus/` | Websocket-gateway (`websocket.gateway.ts`) en de logica die bepaalt wélke updates de moeite waard zijn om naar verbonden front-end clients te sturen (`pegasus.service.ts`). |
| `shared/` | De gedeelde event-namen (enums) en de `GliderStatus`-enum, zie [Events](#events). |
| `types/` | Gegenereerde/handmatige TypeScript-types voor de Helios-API-datasets (starts, vliegtuigen, daginfo, ...). |
| `common/` | Configuratie laden (`configuration.ts`), simpele bestands-cache (`storage.service.ts`), overige utilities. |

Iedere module heeft een eigen `*.module.ts`; ze worden allemaal samengevoegd in `app.module.ts`.

## Compileren en draaien

Vereisten: Node.js 20 of hoger (zie `Dockerfile`, gebaseerd op `node:lts-alpine`) en npm.

```bash
# dependencies installeren
npm install

# compileren (TypeScript -> dist/)
npm run build

# lokaal draaien, zonder watch
npm run start

# lokaal draaien met automatisch herladen bij codewijzigingen
npm run start:dev

# lokaal draaien met debugger + watch
npm run start:debug

# productie: eerst builden, dan de gecompileerde JS starten
npm run build
npm run start:prod
```

Code opmaken/linten:

```bash
npm run format   # prettier
npm run lint     # eslint --fix
```

### Docker

De meegeleverde `Dockerfile` bouwt in twee stappen (builder + slanke runtime-image):

```bash
docker build -t flarm-js .
docker run --env-file .env -v $(pwd)/flarm-config.yaml:/app/flarm-config.yaml flarm-js
```

Zorg dat `.env` en `flarm-config.yaml` (zie [Configuratie](#configuratie)) bij het draaien
beschikbaar zijn — ze worden niet in het image gebakken.

## Configuratie

Configuratie komt uit twee bronnen: een `.env`-bestand (procesomgeving/infrastructuur) en
een YAML-bestand (applicatie-instellingen, zie `common/configuration.ts`).

### `.env`

Zie `example.env` als startpunt, kopieer naar `.env`:

| Variabele | Betekenis |
|---|---|
| `NODE_ENV` | Omgevingsnaam, wordt alleen gebruikt in de logging-metadata. |
| `INSTANCE` | Naam van deze instantie/deployment, ook alleen voor logging-metadata. |
| `FLARM_CONFIG` | Pad naar het YAML-configuratiebestand (zie hieronder). Standaard `flarm-config.yaml` in de working directory. |
| `OGN_LOG_DIR` | Map waarin de ruwe, binnenkomende OGN/APRS-regels worden weggeschreven (zie `ogn-recorder.ts`). Leeg = niet opnemen. |
| `PARSED_LOG_DIR` | Map waarin de verwerkte, per-bericht statusdata wordt weggeschreven (zie `parsed-logger.ts`). Leeg = niet opnemen. |
| `LOGGER_LEVEL` | Winston log-niveau (`debug`, `verbose`, `info`, ...). |
| `LOGGER_SERVER_URL` | (optioneel) URL van een [Seq](https://datalust.co/seq) log-server; als gezet, worden logs ook daarheen gestuurd. |
| `LOGGER_API_KEY` | (optioneel) API-key voor bovenstaande Seq-server. |

### `flarm-config.yaml`

Zie `flarm-config-template.yaml` als startpunt (kopiëren naar `flarm-config.yaml`, of het
pad instellen via `FLARM_CONFIG`). Standaardwaarden staan in `common/configuration.ts` en
worden overschreven door wat er in dit bestand staat.

```yaml
OGN:
  simulator: ""              # pad naar een opgenomen sessie (zie OGN_LOG_DIR); leeg = live verbinden
  aprsServer: "aprs.glidernet.org"
  aprsPort: 14580
  aprsUser: "GEZC-EHTL"       # APRS-IS login-naam; wordt anders willekeurig gegenereerd
  aprsFilter: 'r/52.06/5.94/15'   # geografisch filter: r/lat/lon/radius(km)

Helios:
  url: ""                    # basis-URL van de Helios-API
  username: ''
  password: ''
  token: ''                  # optioneel: vast token-onderdeel, zie login.service.ts

MQTT:
  brokerUrl: ''               # bv. 'mqtt://broker.example.com'; leeg = MQTT uitgeschakeld
  topic: 'helios/+'
  username: ''
  password: ''

Vliegveld:
  code: 'EHTL'                 # moet dezelfde zijn als in Helios (zie ref_types)
  hoogte: 80                  # veldhoogte in meters, voor AGL-hoogteberekening
  Banen:
    - code: '22R'
      GeoJSON: '/pad/naar/EHTL t-strip.json'
    # ... één entry per baan/richting
```

Toelichting per sectie:

- **`OGN`** — verbinding met het OGN/APRS-netwerk waar Flarm-posities vandaan komen
  (`flarm-ogn.service.ts`). Is `simulator` gezet, dan wordt in plaats van een live
  verbinding een eerder opgenomen bestand afgespeeld (handig voor lokaal ontwikkelen/testen,
  zie ook `OGN_LOG_DIR`).
- **`Helios`** — inloggegevens en basis-URL van de Helios-API (`helios/apiservice/*`). Het
  token wordt bij het inloggen automatisch met de dag-van-het-jaar gecombineerd
  (`login.service.ts`).
- **`MQTT`** — optionele broker waarop Helios wijzigingen publiceert (`mqtt.service.ts`).
  Laat `brokerUrl` leeg om MQTT uit te schakelen; de applicatie valt dan terug op de
  periodieke polling in `helios-inbound-worker.ts`.
- **`Vliegveld`** — het vliegveld dat gevolgd wordt (moet overeenkomen met een `CODE` in
  Helios) en de veldhoogte (voor AGL-hoogteberekeningen). `Banen` koppelt elke baan/richting
  aan een GeoJSON-polygoon (zie de `EHTL *.json`-bestanden in de projectroot als voorbeeld).
  Op basis van de actieve baan (uit de Helios-daginfo) wordt de bijbehorende polygoon
  gebruikt om te bepalen of een vliegtuig zich binnen het vliegveld bevindt
  (`getVliegveld`/`isInsidePolygon`/`loadGeoFence` in `helios-inbound-worker.ts`).

## Events

De applicatie is opgebouwd rond vier groepen events (alle enums/constants in `src/shared/`
en `src/mqtt/mqtt.events.ts`), verstuurd via NestJS's `EventEmitter2`. Een handler abonneert
zich met `@OnEvent(...)`.

### `FlarmEvents` (`shared/FlarmEvents.ts`)

Uitgezonden door `FlarmOgnService`, ontvangen door `ProcessingService`.

| Event | Payload | Betekenis |
|---|---|---|
| `DataReceived` | `FlarmData` | Een nieuw, geldig en gefilterd Flarm-bericht is binnengekomen (na Kalman-filtering). Triggert de statusmachine in `processing.ts`. |
| `LostFlarm` | `flarmId: string` | Van dit vliegtuig is al 15+ minuten niets meer ontvangen; lokale state (Kalman-filter, cache) is opgeruimd. |

### `GliderEvents` (`shared/GliderEvents.ts`)

Uitgezonden door `ProcessingService` op basis van vluchtstatus-overgangen, ontvangen door
`HeliosOutboundWorker` (die de wijziging naar Helios wegschrijft).

| Event | Payload | Betekenis |
|---|---|---|
| `GliderStart` | `startID: number` | Vliegtuig is opgestegen → starttijd opslaan in Helios. |
| `GliderLanded` | `startID: number` | Vliegtuig is geland (direct, voorspeld op basis van extrapolatie, of na een lange stilte) → landingstijd opslaan. |
| `SleepHoogte` | `startID: number, hoogte: number` | Een sleepvliegtuig is geland; `startID` is de start van het **gesleepte zweefvliegtuig** (opgezocht via `SLEEPKIST_ID`), `hoogte` de bereikte sleephoogte. |
| `StartMethodeDetermined` | `startID: number, startMethode: StartMethode, sleepkistID: number` | 30 seconden na het opstijgen bepaalt Flarm-data (klimsnelheid, en zo nodig positie/snelheid/koers t.o.v. andere vliegtuigen) of het een lier-, sleep- of zelfstart was. Wordt gebruikt om `SLEEPKIST_ID` in Helios te corrigeren als dat nog ontbrak of fout was, en om bij een afwijkende startmethode een opmerking te plaatsen. |
| `GliderAanmelden` | `vliegtuigID: number, vliegveldID: number` | Vliegtuig is (voor het eerst) binnen het vliegveld gedetecteerd en moet als "aanwezig" worden aangemeld. |

### `HeliosEvents` (`shared/HeliosEvents.ts`)

Uitgezonden door `HeliosInboundWorker`/`HeliosOutboundWorker`, ontvangen door
`ProcessingService` en `PegasusService`.

| Event | Payload | Betekenis |
|---|---|---|
| `StartsGeladen` | — | De lokale cache van starts (`startsStore`) is (opnieuw) geladen of bijgewerkt (via de periodieke poll of via een MQTT-update). Triggert o.a. `ProcessingService.mapStartOnFlarm()`, dat de juiste start weer aan elk gevolgd vliegtuig koppelt. |
| `OnStartRecorded` | `startID: number` | De starttijd is succesvol in Helios opgeslagen → `PegasusService` stuurt de bijgewerkte start naar de front-end. |
| `OnLandedRecorded` | `startID: number` | De landingstijd is succesvol in Helios opgeslagen → idem. |

### `WebSocketEvents` (`shared/WebSocketEvents.ts`)

Interne event-bus tussen `ProcessingService`/`PegasusService` en de websocket-laag
(`pegasus/`); geen directe koppeling met externe systemen.

| Event | Payload | Betekenis |
|---|---|---|
| `OnConnect` | — | Een front-end client heeft verbinding gemaakt (`websocket.gateway.ts`) → `PegasusService` wist zijn "laatst verstuurd"-cache, en `ProcessingService.stuurAlles()` stuurt de volledige huidige status van alle gevolgde vliegtuigen opnieuw. |
| `OnDisconnect` | — | Gereserveerd; momenteel geen listener. |
| `PublishFlarm` | `FlarmDataWithStatus` | Nieuwe of gewijzigde status van een gevolgd vliegtuig. `PegasusService` bepaalt op basis hiervan (throttling/dedupe) of er echt iets naar de front-end moet. |
| `SendFlarmMessage` | vlak object (zie `pegasus.service.ts: sendFlarmMessage`) | Daadwerkelijk te versturen bericht → `websocket.gateway.ts` zendt dit als `flarm`-event naar alle clients. |
| `SendStartMessage` | vlak object (zie `pegasus.service.ts: publishStart`) | Daadwerkelijk te versturen start-update → verzonden als `start`-event naar alle clients. |

### MQTT-events (`mqtt/mqtt.events.ts`)

Uitgezonden door `MqttService` zodra er een MQTT-bericht van Helios binnenkomt, ontvangen
door `HeliosInboundWorker` om zijn lokale cache direct (zonder te wachten op de volgende
polling-ronde) bij te werken. Payload is steeds een `HeliosMqttEvent { type, voor, resultaat,
recordId }`, met `voor`/`resultaat` de rij vóór/ná de wijziging.

| Event | Helios-tabel |
|---|---|
| `MQTT_STARTLIJST` | `oper_startlijst` (starts) |
| `MQTT_VLIEGTUIGEN` | `ref_vliegtuigen` (vliegtuigen) |
| `MQTT_DAGINFO` | `oper_daginfo` |
| `MQTT_AANWEZIG` | `oper_aanwezig_vliegtuig` |

## Dataflow (samenvatting)

```
OGN/APRS-netwerk
   │  (TCP, of simulator-bestand)
   ▼
FlarmOgnService            ── parsen, dupliceer-/ruisfilter, Kalman-filter per vliegtuig
   │  FlarmEvents.DataReceived
   ▼
ProcessingService          ── statusmachine per vliegtuig (opstijgen/vliegen/circuit/landen)
   │                              │
   │ GliderEvents.*               │ WebSocketEvents.PublishFlarm
   ▼                              ▼
HeliosOutboundWorker          PegasusService ── bepaalt of update de moeite waard is
   │  schrijft terug via           │ WebSocketEvents.Send*Message
   │  Helios REST-API               ▼
   ▼                          WebsocketGateway ── socket.io naar front-end clients
Helios (extern systeem)
   │  MQTT-publicaties (push)
   ▼
MqttService  ──  MQTT_* events  ──  HeliosInboundWorker (lokale cache: starts, vliegtuigen, ...)
                                          ▲
                                          │ ook periodiek ververst via @Cron polling
```

## Logging en data-opname

- Logging loopt via Winston (`main.ts`); niveau via `LOGGER_LEVEL`, optioneel ook naar een
  [Seq](https://datalust.co/seq)-server (`LOGGER_SERVER_URL`/`LOGGER_API_KEY`).
- **Ruwe OGN-data**: als `OGN_LOG_DIR` gezet is, schrijft `ogn-recorder.ts` elke ontvangen
  regel (met timestamp) weg, per uur een nieuw bestand, oudere bestanden worden na een uur
  gecomprimeerd (`.gz`) en na 14 dagen verwijderd. Dit zijn ook de bestanden die je terug
  kunt afspelen via `OGN.simulator` in `flarm-config.yaml`.
- **Verwerkte data**: als `PARSED_LOG_DIR` gezet is, schrijft `parsed-logger.ts` elk verwerkt
  `FlarmDataWithStatus`-object weg (zelfde rotatie-/retentiebeleid als hierboven). Handig om
  achteraf te analyseren hoe de statusmachine een vlucht heeft geïnterpreteerd.
- Beide opnames worden overgeslagen zolang `OGN.simulator` actief is (dan speel je immers al
  een opname af, en wil je die niet opnieuw wegschrijven).

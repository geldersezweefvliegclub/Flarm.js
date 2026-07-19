import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as mqtt from 'mqtt';
import { RawHeliosMqttMessage } from './mqtt.types';
import { MQTT_AANWEZIG, MQTT_DAGINFO, MQTT_STARTLIJST, MQTT_VLIEGTUIGEN, HeliosMqttEvent } from './mqtt.events';

// Deze service luistert naar een MQTT-broker waarop Helios (de start administratiesoftware) meldingen
// publiceert zodra er in de database iets wijzigt (toevoegen/aanpassen/verwijderen van een start,
// vliegtuig, daginfo, aanwezig vliegtuig, ...). Dit is de "push"-tegenhanger van de periodieke ophaal-
// cronjobs in helios-inbound-worker.ts: zo hoeft de rest van de applicatie niet te wachten tot de
// volgende polling-ronde om een wijziging te zien. Elk MQTT-bericht wordt vertaald naar een intern
// event (MQTT_STARTLIJST/MQTT_VLIEGTUIGEN/MQTT_DAGINFO/MQTT_AANWEZIG) waar andere services op kunnen
// reageren met @OnEvent(...).
@Injectable()
export class MqttService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MqttService.name);
  private client!: mqtt.MqttClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // Wordt één keer aangeroepen zodra de hele applicatie is opgestart. Zet de verbinding met de
  // MQTT-broker op en abonneert zich op het geconfigureerde topic. Is er geen broker-URL geconfigureerd,
  // dan wordt MQTT simpelweg overgeslagen (de applicatie kan ook zonder MQTT werken, dan vallen we
  // terug op de periodieke polling in helios-inbound-worker.ts).
  onApplicationBootstrap(): void {
    const brokerUrl = this.configService.get<string>('MQTT.brokerUrl');
    if (!brokerUrl) {
      this.logger.warn('MQTT.brokerUrl not set, MQTT disabled');
      return;
    }

    const topic    = this.configService.get<string>('MQTT.topic');
    const username = this.configService.get<string>('MQTT.username') || undefined;
    const password = this.configService.get<string>('MQTT.password') || undefined;

    // de mqtt-library regelt zelf automatisch herverbinden bij verbindingsverlies
    this.client = mqtt.connect(brokerUrl, { username, password });

    this.client.on('connect', () => {
      this.logger.log(`Connected to MQTT broker: ${brokerUrl}`);
      // pas ná een geslaagde (her)verbinding opnieuw abonneren, dat moet bij elke reconnect opnieuw
      this.client.subscribe(topic, (err) => {
        if (err) {
          this.logger.error(`Failed to subscribe to ${topic}: ${err.message}`);
        } else {
          this.logger.log(`Subscribed to topic: ${topic}`);
        }
      });
    });

    // elk binnenkomend bericht op het geabonneerde topic doorgeven aan de verwerkingslogica
    this.client.on('message', (receivedTopic, payload) => {
      this.handleMessage(receivedTopic, payload);
    });

    this.client.on('error', (err) => {
      this.logger.error(`MQTT error: ${err.message}`);
    });

    this.client.on('disconnect', () => {
      // alleen loggen; de mqtt-library probeert zelf op de achtergrond opnieuw te verbinden
      this.logger.warn('MQTT connection lost');
    });
  }

  // bij het afsluiten van de applicatie de MQTT-verbinding netjes sluiten
  onApplicationShutdown(): void {
    this.client?.end();
  }

  // Verwerkt één binnengekomen MQTT-bericht: parsen, omzetten naar een intern HeliosMqttEvent, en op
  // basis van de databasetabel waar de wijziging in Helios plaatsvond doorsturen als het bijbehorende
  // interne event. Andere services (bv. helios-inbound-worker.ts) luisteren op die interne events om
  // hun eigen lokale cache (startsStore, vliegtuigenStore, ...) direct bij te werken.
  private handleMessage(topic: string, payload: Buffer): void {
    // Helios stuurt de payload als JSON-tekst; bij corrupte/onverwachte inhoud negeren we het bericht
    let raw: RawHeliosMqttMessage;
    try {
      raw = JSON.parse(payload.toString());
    } catch {
      this.logger.error(`Invalid JSON on ${topic}: ${payload.toString()}`);
      return;
    }

    this.logger.verbose(`MQTT: ${raw.type} on ${raw.table} (id: ${raw.data.record_id})`);

    // 'voor' = de rij zoals die was vóór de wijziging (bij toevoegen: leeg), 'resultaat' = de rij ná de
    // wijziging (bij verwijderen: leeg). Helios stuurt deze als arrays met telkens één element, vandaar [0].
    const event = new HeliosMqttEvent(
      raw.type,
      (raw.data.voor?.[0]      ?? null) as Record<string, unknown> | null,
      (raw.data.resultaat?.[0] ?? null) as Record<string, unknown> | null,
      raw.data.record_id,
    );

    // op basis van de gewijzigde databasetabel het juiste interne event uitsturen; onbekende tabellen
    // interesseren ons niet en worden alleen gelogd (geen fout, kan bewust zijn als Helios meer tabellen
    // publiceert dan wij gebruiken)
    switch (raw.table) {
      case 'oper_startlijst':        this.eventEmitter.emit(MQTT_STARTLIJST,  event); break;
      case 'ref_vliegtuigen':        this.eventEmitter.emit(MQTT_VLIEGTUIGEN, event); break;
      case 'oper_daginfo':           this.eventEmitter.emit(MQTT_DAGINFO,     event); break;
      case 'oper_aanwezig_vliegtuig':this.eventEmitter.emit(MQTT_AANWEZIG,    event); break;
      default:
        this.logger.debug(`No handler for table: ${raw.table}`);
    }
  }
}

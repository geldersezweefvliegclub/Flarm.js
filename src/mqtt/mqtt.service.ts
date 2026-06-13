import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as mqtt from 'mqtt';
import { RawHeliosMqttMessage } from './mqtt.types';
import { MQTT_AANWEZIG, MQTT_DAGINFO, MQTT_STARTLIJST, MQTT_VLIEGTUIGEN, HeliosMqttEvent } from './mqtt.events';

@Injectable()
export class MqttService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MqttService.name);
  private client!: mqtt.MqttClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onApplicationBootstrap(): void {
    const brokerUrl = this.configService.get<string>('MQTT.brokerUrl');
    if (!brokerUrl) {
      this.logger.warn('MQTT.brokerUrl not set, MQTT disabled');
      return;
    }

    const topic    = this.configService.get<string>('MQTT.topic');
    const username = this.configService.get<string>('MQTT.username') || undefined;
    const password = this.configService.get<string>('MQTT.password') || undefined;

    this.client = mqtt.connect(brokerUrl, { username, password });

    this.client.on('connect', () => {
      this.logger.log(`Connected to MQTT broker: ${brokerUrl}`);
      this.client.subscribe(topic, (err) => {
        if (err) {
          this.logger.error(`Failed to subscribe to ${topic}: ${err.message}`);
        } else {
          this.logger.log(`Subscribed to topic: ${topic}`);
        }
      });
    });

    this.client.on('message', (receivedTopic, payload) => {
      this.handleMessage(receivedTopic, payload);
    });

    this.client.on('error', (err) => {
      this.logger.error(`MQTT error: ${err.message}`);
    });

    this.client.on('disconnect', () => {
      this.logger.warn('MQTT connection lost');
    });
  }

  onApplicationShutdown(): void {
    this.client?.end();
  }

  private handleMessage(topic: string, payload: Buffer): void {
    let raw: RawHeliosMqttMessage;
    try {
      raw = JSON.parse(payload.toString());
    } catch {
      this.logger.error(`Invalid JSON on ${topic}: ${payload.toString()}`);
      return;
    }

    this.logger.log(`MQTT ${raw.type} on ${raw.table} (id: ${raw.data.record_id})`);

    const event = new HeliosMqttEvent(
      raw.type,
      (raw.data.voor?.[0]      ?? null) as Record<string, unknown> | null,
      (raw.data.resultaat?.[0] ?? null) as Record<string, unknown> | null,
      raw.data.record_id,
    );

    switch (raw.table) {
      case 'startlijst':        this.eventEmitter.emit(MQTT_STARTLIJST,  event); break;
      case 'vliegtuigen':       this.eventEmitter.emit(MQTT_VLIEGTUIGEN, event); break;
      case 'daginfo':           this.eventEmitter.emit(MQTT_DAGINFO,     event); break;
      case 'aanwezig_vliegtuig':this.eventEmitter.emit(MQTT_AANWEZIG,    event); break;
      default:
        this.logger.debug(`No handler for table: ${raw.table}`);
    }
  }
}

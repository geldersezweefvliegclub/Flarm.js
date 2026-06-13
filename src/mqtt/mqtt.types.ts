export type HeliosMqttType = 'aanpassen' | 'toevoegen' | 'verwijderen';

export interface RawHeliosMqttMessage {
  type: HeliosMqttType;
  table: string;
  data: RawHeliosMqttData;
  timestamp: string;
}

export interface RawHeliosMqttData {
  voor?: Record<string, unknown>[];
  data?: Record<string, unknown>;
  resultaat?: Record<string, unknown>[];
  record_id?: number;
}

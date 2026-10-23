export type ConnectionState =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'AUTH_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'INITIALIZING';

export interface WhatsAppStatus {
  status: ConnectionState;
  connected: boolean;
  phone?: string | null;
  pushname?: string | null;
  qrCode?: string | null;
  pairingCode?: string | null;
  error?: string | null;
  endpoint?: string;
  instance?: string;
  details?: any;
}

export interface WhatsAppGroupData {
  provider_group_id: string; // The original @g.us identifier without modification
  name: string;
  picture_url?: string | null;
  participants_count?: number | null;
  synced_at: string;
  active: boolean;
}

export interface SendResult {
  success: boolean;
  provider_message_id?: string | null;
  request_started_at: string;
  response_received_at: string;
  error?: string | null;
  methodUsed?: 'sendLinkWithAutoPreview' | 'sendText' | 'sendMedia';
  details?: any;
  isOffline?: boolean;
}

export interface WhatsAppProvider {
  getStatus(): Promise<WhatsAppStatus>;
  connect(): Promise<{ qrCode?: string | null; pairingCode?: string | null; status: string }>;
  getQrCode(): Promise<string | null>;
  getGroups(): Promise<WhatsAppGroupData[]>;
  sendText(to: string, text: string): Promise<SendResult>;
  sendLinkWithPreview(to: string, url: string, text: string): Promise<SendResult>;
  sendMedia?(to: string, mediaUrl: string, caption?: string): Promise<SendResult>;
  disconnect(): Promise<boolean>;
  syncGroups(): Promise<{ syncedCount: number; groups: WhatsAppGroupData[] }>;
}

import { Env } from '../types';

export type EvolutionState =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'AUTH_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'TUNNEL_UNAVAILABLE';

export interface EvolutionStatusResult {
  status: EvolutionState;
  connected: boolean;
  phone?: string | null;
  pushname?: string | null;
  qrCode?: string | null;
  pairingCode?: string | null;
  error?: string | null;
  endpoint: string;
  instance: string;
}

export interface EvolutionSendResult {
  success: boolean;
  provider_message_id?: string | null;
  request_started_at: string;
  response_received_at: string;
  methodUsed?: 'sendLinkWithAutoPreview' | 'sendText';
  error?: string | null;
  isOffline?: boolean;
}

export class WorkerEvolutionClient {
  private env: Env;
  private baseUrl: string;
  private apiKey: string;
  private instance: string;

  constructor(env: Env) {
    this.env = env;
    this.baseUrl = (env.EVOLUTION_API_URL || env.OPENWA_BASE_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');
    this.apiKey = env.EVOLUTION_API_KEY || env.OPENWA_API_KEY || 'afiliado-auto-secret-key-2026';
    this.instance = env.EVOLUTION_INSTANCE || 'afiliado-auto';
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'apikey': this.apiKey,
    };

    if (this.env.CF_ACCESS_CLIENT_ID && this.env.CF_ACCESS_CLIENT_SECRET) {
      headers['CF-Access-Client-Id'] = this.env.CF_ACCESS_CLIENT_ID;
      headers['CF-Access-Client-Secret'] = this.env.CF_ACCESS_CLIENT_SECRET;
    }

    return headers;
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<{ ok: boolean; status: number; data: any }> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const headers = {
      ...this.getHeaders(),
      ...(options.headers || {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    let data: any = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json().catch(() => null);
    } else {
      const text = await response.text().catch(() => '');
      data = { text };
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  }

  private async ensureInstance(): Promise<void> {
    try {
      const res = await this.request(`/instance/connectionState/${this.instance}`, { method: 'GET' });
      if (res.status === 404 || !res.ok) {
        await this.request('/instance/create', {
          method: 'POST',
          body: JSON.stringify({
            instanceName: this.instance,
            token: this.apiKey,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
          }),
        });
      }
    } catch (e) {
      console.warn('Worker Evolution ensureInstance warning:', e);
    }
  }

  public async getStatus(): Promise<EvolutionStatusResult> {
    try {
      let stateRes;
      try {
        stateRes = await this.request(`/instance/connectionState/${this.instance}`, { method: 'GET' });
      } catch (connErr: any) {
        return {
          status: 'SERVICE_UNAVAILABLE',
          connected: false,
          endpoint: this.baseUrl,
          instance: this.instance,
          error: `Serviço indisponível (Evolution API offline em ${this.baseUrl}: ${connErr.message})`,
        };
      }

      if (stateRes.status === 502 || stateRes.status === 504) {
        return {
          status: 'TUNNEL_UNAVAILABLE',
          connected: false,
          endpoint: this.baseUrl,
          instance: this.instance,
          error: 'Cloudflare Tunnel indisponível. Verifique se o daemon cloudflared e a Evolution API estão em execução.',
        };
      }

      if (stateRes.status === 401 || stateRes.status === 403) {
        return {
          status: 'AUTH_ERROR',
          connected: false,
          endpoint: this.baseUrl,
          instance: this.instance,
          error: 'Erro de autenticação (EVOLUTION_API_KEY inválida ou rejeitada).',
        };
      }

      if (stateRes.status === 404) {
        await this.ensureInstance();
        stateRes = await this.request(`/instance/connectionState/${this.instance}`, { method: 'GET' });
      }

      const instanceData = stateRes.data?.instance || stateRes.data || {};
      const state = (instanceData.state || '').toLowerCase();
      const isConnected = state === 'open';

      let phone: string | null = null;
      let pushname: string | null = null;
      let qrCode: string | null = null;

      if (isConnected) {
        phone = instanceData.ownerJid ? instanceData.ownerJid.replace(/@.*$/, '') : instanceData.number || null;
        pushname = instanceData.profileName || 'Afiliado Auto Admin';
      } else {
        qrCode = await this.getQrCode();
      }

      return {
        status: isConnected ? 'CONNECTED' : 'DISCONNECTED',
        connected: isConnected,
        phone,
        pushname,
        qrCode,
        endpoint: this.baseUrl,
        instance: this.instance,
      };
    } catch (err: any) {
      return {
        status: 'SERVICE_UNAVAILABLE',
        connected: false,
        endpoint: this.baseUrl,
        instance: this.instance,
        error: `Falha de conexão com Evolution API: ${err.message}`,
      };
    }
  }

  public async connect(): Promise<{ qrCode?: string | null; pairingCode?: string | null; status: string }> {
    await this.ensureInstance();
    const res = await this.request(`/instance/connect/${this.instance}`, { method: 'GET' });

    let qrCode: string | null = null;
    let pairingCode: string | null = null;

    if (res.ok && res.data) {
      const raw = res.data.base64 || res.data.code || res.data.qrcode?.base64;
      if (typeof raw === 'string') {
        qrCode = raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;
      }
      pairingCode = res.data.pairingCode || null;
    }

    return {
      qrCode,
      pairingCode,
      status: res.data?.instance?.state || (qrCode ? 'connecting' : 'unknown'),
    };
  }

  public async getQrCode(): Promise<string | null> {
    try {
      const res = await this.request(`/instance/connect/${this.instance}`, { method: 'GET' });
      if (res.ok && res.data) {
        const raw = res.data.base64 || res.data.code || res.data.qrcode?.base64;
        if (typeof raw === 'string') {
          return raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  public async disconnect(): Promise<boolean> {
    try {
      const res = await this.request(`/instance/logout/${this.instance}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async getGroups(): Promise<Array<{
    provider_group_id: string;
    name: string;
    picture_url?: string | null;
    participants_count?: number | null;
  }>> {
    let res = await this.request(`/group/fetchAllGroups/${this.instance}?getParticipants=true`, { method: 'GET' });
    if (!res.ok) res = await this.request(`/group/fetchAllGroups/${this.instance}`, { method: 'GET' });

    if (!res.ok) {
      throw new Error(`Evolution API HTTP ${res.status}: ${JSON.stringify(res.data)} ao sincronizar grupos.`);
    }

    const rawList = Array.isArray(res.data) ? res.data : (res.data?.response || res.data?.groups || []);

    return (rawList || [])
      .filter((item: any) => {
        const id = item?.id || item?.jid || item?.groupJid || '';
        return typeof id === 'string' && id.includes('@g.us');
      })
      .map((g: any) => ({
        provider_group_id: g.id || g.jid || g.groupJid,
        name: g.subject || g.name || 'Grupo sem nome',
        picture_url: g.pictureUrl || g.profilePicUrl || null,
        participants_count: g.size || g.participants?.length || 0,
      }));
  }

  public async sendText(to: string, text: string): Promise<EvolutionSendResult> {
    const startedAt = new Date().toISOString();

    try {
      const res = await this.request(`/message/sendText/${this.instance}`, {
        method: 'POST',
        body: JSON.stringify({
          number: to,
          text: text,
        }),
      });

      const receivedAt = new Date().toISOString();

      if (!res.ok) {
        const isOffline = res.status === 502 || res.status === 504;
        return {
          success: false,
          request_started_at: startedAt,
          response_received_at: receivedAt,
          methodUsed: 'sendText',
          error: `HTTP ${res.status}: ${JSON.stringify(res.data)}`,
          isOffline,
        };
      }

      const messageId = res.data?.key?.id || res.data?.id || 'sent';

      return {
        success: true,
        provider_message_id: messageId,
        request_started_at: startedAt,
        response_received_at: receivedAt,
        methodUsed: 'sendText',
      };
    } catch (err: any) {
      return {
        success: false,
        request_started_at: startedAt,
        response_received_at: new Date().toISOString(),
        methodUsed: 'sendText',
        error: err.message,
        isOffline: true,
      };
    }
  }

  public async sendLinkWithPreview(to: string, url: string, text: string): Promise<EvolutionSendResult> {
    const startedAt = new Date().toISOString();
    const fullMessage = `${text}\n\n${url}`.trim();

    try {
      const res = await this.request(`/message/sendText/${this.instance}`, {
        method: 'POST',
        body: JSON.stringify({
          number: to,
          text: fullMessage,
          linkPreview: true,
        }),
      });

      const receivedAt = new Date().toISOString();

      if (res.ok) {
        const messageId = res.data?.key?.id || res.data?.id || 'sent-preview';
        return {
          success: true,
          provider_message_id: messageId,
          request_started_at: startedAt,
          response_received_at: receivedAt,
          methodUsed: 'sendLinkWithAutoPreview',
        };
      }
    } catch {
      console.warn('Evolution API link preview failed, fallback to sendText...');
    }

    return this.sendText(to, fullMessage);
  }
}

import { Env } from '../types';

export type OpenWAState =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'AUTH_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'TUNNEL_UNAVAILABLE';

export interface OpenWAStatusResult {
  status: OpenWAState;
  connected: boolean;
  phone?: string | null;
  pushname?: string | null;
  qrCode?: string | null;
  error?: string | null;
  endpoint: string;
}

export interface OpenWASendResult {
  success: boolean;
  provider_message_id?: string | null;
  request_started_at: string;
  response_received_at: string;
  methodUsed?: 'sendLinkWithAutoPreview' | 'sendText';
  error?: string | null;
  isOffline?: boolean;
}

export class WorkerOpenWAClient {
  private env: Env;
  private baseUrl: string;
  private apiKey: string;

  constructor(env: Env) {
    this.env = env;
    this.baseUrl = (env.OPENWA_BASE_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');
    this.apiKey = env.OPENWA_API_KEY || 'OpeNwA';
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      'api_key': this.apiKey,
    };

    // Cloudflare Access Service Token protection if configured
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

  public async getStatus(): Promise<OpenWAStatusResult> {
    try {
      let healthRes;
      try {
        healthRes = await this.request('/health', { method: 'GET' });
      } catch (connErr: any) {
        return {
          status: 'SERVICE_UNAVAILABLE',
          connected: false,
          endpoint: this.baseUrl,
          error: `Serviço indisponível (OpenWA offline em ${this.baseUrl}: ${connErr.message})`,
        };
      }

      // Check Cloudflare Tunnel errors (502 Bad Gateway / 504 Gateway Timeout)
      if (healthRes.status === 502 || healthRes.status === 504) {
        return {
          status: 'TUNNEL_UNAVAILABLE',
          connected: false,
          endpoint: this.baseUrl,
          error: 'Cloudflare Tunnel indisponível. Verifique se o daemon cloudflared e o OpenWA estão em execução no seu computador.',
        };
      }

      if (healthRes.status === 401 || healthRes.status === 403) {
        return {
          status: 'AUTH_ERROR',
          connected: false,
          endpoint: this.baseUrl,
          error: 'Erro de autenticação (X-API-Key inválida ou rejeitada pelo OpenWA).',
        };
      }

      if (!healthRes.ok) {
        return {
          status: 'SERVICE_UNAVAILABLE',
          connected: false,
          endpoint: this.baseUrl,
          error: `OpenWA respondeu com status HTTP ${healthRes.status}.`,
        };
      }

      const healthData = healthRes.data;
      const isHealthConnected =
        healthData?.status === 'CONNECTED' ||
        healthData?.isConnected === true ||
        healthData?.response === true;

      let isConnected = isHealthConnected;
      let phone: string | null = null;
      let pushname: string | null = null;

      try {
        const meRes = await this.request('/api/session/getMe', { method: 'GET' })
          .catch(() => this.request('/getMe', { method: 'POST', body: JSON.stringify({}) }));

        if (meRes.ok && meRes.data) {
          const userObj = meRes.data.response || meRes.data;
          if (userObj?.id) {
            isConnected = true;
            phone = userObj.id.user || userObj.phone || null;
            pushname = userObj.pushname || 'Afiliado Auto Admin';
          }
        }
      } catch {}

      let qrCode: string | null = null;
      if (!isConnected) {
        try {
          const qrRes = await this.request('/api/session/qr', { method: 'GET' })
            .catch(() => this.request('/getQrCode', { method: 'POST', body: JSON.stringify({}) }));

          if (qrRes.ok && qrRes.data) {
            const raw = qrRes.data.response || qrRes.data.qr || qrRes.data;
            if (typeof raw === 'string') {
              qrCode = raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;
            }
          }
        } catch {}
      }

      return {
        status: isConnected ? 'CONNECTED' : 'DISCONNECTED',
        connected: isConnected,
        phone,
        pushname,
        qrCode,
        endpoint: this.baseUrl,
      };
    } catch (err: any) {
      return {
        status: 'SERVICE_UNAVAILABLE',
        connected: false,
        endpoint: this.baseUrl,
        error: `Falha de conexão com OpenWA: ${err.message}`,
      };
    }
  }

  public async getGroups(): Promise<Array<{
    provider_group_id: string;
    name: string;
    picture_url?: string | null;
    participants_count?: number | null;
  }>> {
    let res = await this.request('/api/chats/getAllGroups', { method: 'GET' });
    if (!res.ok) res = await this.request('/api/groups', { method: 'GET' });
    if (!res.ok) res = await this.request('/getAllGroups', { method: 'POST', body: JSON.stringify({}) });

    if (!res.ok) {
      throw new Error(`OpenWA HTTP ${res.status} ao sincronizar grupos.`);
    }

    const rawList = res.data?.response || res.data?.groups || res.data || [];
    if (!Array.isArray(rawList)) {
      throw new Error('Formato inválido retornado pelo OpenWA ao buscar grupos.');
    }

    return rawList
      .filter((item: any) => {
        const id = item?.id?._serialized || item?.id || item?.groupJid || '';
        return typeof id === 'string' && id.includes('@g.us');
      })
      .map((g: any) => ({
        provider_group_id: g.id?._serialized || g.id || g.groupJid,
        name: g.name || g.formattedTitle || g.subject || 'Grupo sem nome',
        picture_url: g.contact?.profilePicThumbObj?.eurl || g.avatar || null,
        participants_count: g.groupMetadata?.participants?.length || g.participants?.length || 0,
      }));
  }

  public async sendText(to: string, text: string): Promise<OpenWASendResult> {
    const startedAt = new Date().toISOString();

    try {
      let res = await this.request('/api/messages/sendText', {
        method: 'POST',
        body: JSON.stringify({ to, text }),
      });

      if (!res.ok) {
        res = await this.request('/sendText', {
          method: 'POST',
          body: JSON.stringify({ args: { to, content: text } }),
        });
      }

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

      const raw = res.data?.response || res.data;
      const messageId = typeof raw === 'string' ? raw : raw?.id?._serialized || raw?.id || 'sent';

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

  public async sendLinkWithPreview(to: string, url: string, text: string): Promise<OpenWASendResult> {
    const startedAt = new Date().toISOString();

    try {
      let res = await this.request('/api/messages/sendLinkWithAutoPreview', {
        method: 'POST',
        body: JSON.stringify({ to, url, text }),
      });

      if (!res.ok) {
        res = await this.request('/sendLinkWithAutoPreview', {
          method: 'POST',
          body: JSON.stringify({ args: { chatId: to, url, text } }),
        });
      }

      const receivedAt = new Date().toISOString();

      if (res.ok) {
        const raw = res.data?.response || res.data;
        const messageId = typeof raw === 'string' ? raw : raw?.id?._serialized || raw?.id || 'sent-preview';

        return {
          success: true,
          provider_message_id: messageId,
          request_started_at: startedAt,
          response_received_at: receivedAt,
          methodUsed: 'sendLinkWithAutoPreview',
        };
      }
    } catch (previewErr) {
      console.warn('sendLinkWithAutoPreview failed, executing fallback to sendText...');
    }

    // Fallback to sendText
    const fullMessage = `${text}\n\n${url}`.trim();
    return this.sendText(to, fullMessage);
  }
}

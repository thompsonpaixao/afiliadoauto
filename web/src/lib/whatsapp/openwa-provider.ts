import { db } from '../db';
import {
  WhatsAppProvider,
  WhatsAppStatus,
  WhatsAppGroupData,
  SendResult,
} from './types';

export class OpenWAProvider implements WhatsAppProvider {
  private baseUrl: string;
  private apiKey: string;
  private sessionId: string;

  constructor() {
    const data = db.read();
    const integration = data.integrations.find((i) => i.provider === 'whatsapp');
    const creds = integration?.credentials || {};

    this.baseUrl = (
      process.env.OPENWA_BASE_URL ||
      creds.endpoint ||
      'http://127.0.0.1:8080'
    ).replace(/\/+$/, '');

    this.apiKey = process.env.OPENWA_API_KEY || creds.apiKey || 'OpeNwA';
    this.sessionId = process.env.OPENWA_SESSION_ID || creds.sessionId || 'afiliado-auto';
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      'api_key': this.apiKey, // compatibility for older/newer open-wa easy-api headers
    };
  }

  /**
   * Helper to perform HTTP requests to OpenWA Easy API
   */
  private async request(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ ok: boolean; status: number; data: any }> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const headers = {
      ...this.getHeaders(),
      ...(options.headers || {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
      cache: 'no-store',
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

  /**
   * Health and connection status verification
   */
  public async getStatus(): Promise<WhatsAppStatus> {
    try {
      // 1. Check OpenWA /health
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

      if (healthRes.status === 401 || healthRes.status === 403) {
        return {
          status: 'AUTH_ERROR',
          connected: false,
          endpoint: this.baseUrl,
          error: 'Erro de autenticação (X-API-Key incorreta ou ausente).',
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

      // Check if session is connected
      // OpenWA /health returns e.g. { status: "CONNECTED" } or { isConnected: true } or { response: true }
      const healthData = healthRes.data;
      const isHealthConnected =
        healthData?.status === 'CONNECTED' ||
        healthData?.isConnected === true ||
        healthData?.response === true ||
        healthData?.state === 'CONNECTED';

      // 2. Fetch active host/me info if connected or test isConnected
      let isConnected = isHealthConnected;
      let phone: string | null = null;
      let pushname: string | null = null;

      try {
        // Try /api/session/status or /isConnected or /getMe
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

      // 3. If disconnected, try fetching QR code if available
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

      const connectionState = isConnected ? 'CONNECTED' : 'DISCONNECTED';

      // Update database status
      db.update((d) => {
        const item = d.integrations.find((i) => i.provider === 'whatsapp');
        if (item) {
          item.status = isConnected ? 'connected' : 'disconnected';
          if (isConnected) item.lastSync = new Date().toISOString();
        }
      });

      return {
        status: connectionState,
        connected: isConnected,
        phone,
        pushname,
        qrCode,
        endpoint: this.baseUrl,
        details: healthData,
      };
    } catch (err: any) {
      return {
        status: 'SERVICE_UNAVAILABLE',
        connected: false,
        endpoint: this.baseUrl,
        error: `Falha ao conectar ao OpenWA: ${err.message}`,
      };
    }
  }

  /**
   * Fetch groups from OpenWA instance using endpoints exposed by Easy API
   */
  public async getGroups(): Promise<WhatsAppGroupData[]> {
    const status = await this.getStatus();
    if (!status.connected) {
      throw new Error(`WhatsApp não está conectado (${status.status}: ${status.error || 'Desconectado'}).`);
    }

    // Try multiple Swagger route variants for groups
    let res = await this.request('/api/chats/getAllGroups', { method: 'GET' });
    if (!res.ok) {
      res = await this.request('/api/groups', { method: 'GET' });
    }
    if (!res.ok) {
      res = await this.request('/getAllGroups', { method: 'POST', body: JSON.stringify({}) });
    }
    if (!res.ok) {
      res = await this.request('/api/chats/getAllChats?type=group', { method: 'GET' });
    }

    if (!res.ok) {
      throw new Error(`OpenWA respondeu com HTTP ${res.status} ao buscar grupos.`);
    }

    const rawList = res.data?.response || res.data?.groups || res.data || [];
    if (!Array.isArray(rawList)) {
      throw new Error('Formato inesperado retornado pelo OpenWA ao buscar grupos.');
    }

    const now = new Date().toISOString();
    const groups: WhatsAppGroupData[] = rawList
      .filter((item: any) => {
        const id = item?.id?._serialized || item?.id || item?.groupJid || '';
        return typeof id === 'string' && id.includes('@g.us');
      })
      .map((g: any) => {
        const provider_group_id = g.id?._serialized || g.id || g.groupJid;
        const name = g.name || g.formattedTitle || g.subject || 'Grupo sem nome';
        const picture_url = g.contact?.profilePicThumbObj?.eurl || g.avatar || g.picture_url || null;
        const participants_count =
          g.groupMetadata?.participants?.length ||
          g.participants?.length ||
          g.participantsCount ||
          g.participants_count ||
          null;

        return {
          provider_group_id,
          name,
          picture_url,
          participants_count,
          synced_at: now,
          active: true,
        };
      });

    return groups;
  }

  public async connect(): Promise<{ qrCode?: string | null; pairingCode?: string | null; status: string }> {
    const qr = await this.getQrCode();
    return { qrCode: qr, status: qr ? 'connecting' : 'disconnected' };
  }

  public async getQrCode(): Promise<string | null> {
    try {
      const res = await this.request('/getQrCode', { method: 'POST', body: JSON.stringify({}) });
      if (res.ok && res.data) {
        const raw = res.data.response || res.data.qr || res.data;
        if (typeof raw === 'string') {
          return raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Synchronizes real groups from OpenWA and performs upsert into database.
   * Does NOT duplicate existing groups.
   * Updates name, picture_url, and participants_count.
   * Marks missing groups as active: false (never automatically deletes).
   */
  public async syncGroups(): Promise<{ syncedCount: number; groups: WhatsAppGroupData[] }> {
    const fetchedGroups = await this.getGroups();
    const now = new Date().toISOString();

    const fetchedIds = new Set(fetchedGroups.map((g) => g.provider_group_id));

    db.update((d) => {
      // 1. Upsert fetched groups
      for (const fetched of fetchedGroups) {
        const existingIdx = d.whatsapp_groups.findIndex(
          (g) => (g.provider_group_id || g.groupJid) === fetched.provider_group_id
        );

        if (existingIdx >= 0) {
          // Update existing group
          d.whatsapp_groups[existingIdx] = {
            ...d.whatsapp_groups[existingIdx],
            provider_group_id: fetched.provider_group_id,
            groupJid: fetched.provider_group_id,
            name: fetched.name,
            picture_url: fetched.picture_url,
            imageUrl: fetched.picture_url,
            participants_count: fetched.participants_count,
            participantsCount: fetched.participants_count || 0,
            synced_at: now,
            lastSync: now,
            active: true,
            updatedAt: now,
          };
        } else {
          // Insert new group
          d.whatsapp_groups.push({
            id: `grp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            provider_group_id: fetched.provider_group_id,
            groupJid: fetched.provider_group_id,
            name: fetched.name,
            picture_url: fetched.picture_url,
            imageUrl: fetched.picture_url,
            participants_count: fetched.participants_count,
            participantsCount: fetched.participants_count || 0,
            synced_at: now,
            lastSync: now,
            active: true,
            updatedAt: now,
          });
        }
      }

      // 2. Mark absent groups as inactive (never delete)
      for (const existing of d.whatsapp_groups) {
        const jid = existing.provider_group_id || existing.groupJid;
        if (jid && !fetchedIds.has(jid)) {
          existing.active = false;
          existing.updatedAt = now;
        }
      }

      // Activity log
      d.activity_logs.unshift({
        id: `log-${Date.now()}`,
        type: 'whatsapp',
        description: `${fetchedGroups.length} grupo(s) do WhatsApp sincronizados com sucesso.`,
        createdAt: now,
      });
    });

    return {
      syncedCount: fetchedGroups.length,
      groups: fetchedGroups,
    };
  }

  /**
   * Send plain text message via OpenWA sendText
   */
  public async sendText(to: string, text: string): Promise<SendResult> {
    const startedAt = new Date().toISOString();

    try {
      // OpenWA Easy API endpoints:
      // Try POST /api/messages/sendText with body: { to, text }
      let res = await this.request('/api/messages/sendText', {
        method: 'POST',
        body: JSON.stringify({ to, text }),
      });

      if (!res.ok) {
        // Fallback endpoint variant: POST /sendText with args: { to, content }
        res = await this.request('/sendText', {
          method: 'POST',
          body: JSON.stringify({ args: { to, content: text } }),
        });
      }

      const receivedAt = new Date().toISOString();

      if (!res.ok) {
        const errDetail = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        return {
          success: false,
          request_started_at: startedAt,
          response_received_at: receivedAt,
          methodUsed: 'sendText',
          error: `HTTP ${res.status}: ${errDetail}`,
          details: res.data,
        };
      }

      const raw = res.data?.response || res.data;
      const messageId =
        typeof raw === 'string'
          ? raw
          : raw?.id?._serialized || raw?.id || raw?.messageId || 'sent';

      return {
        success: true,
        provider_message_id: messageId,
        request_started_at: startedAt,
        response_received_at: receivedAt,
        methodUsed: 'sendText',
        details: res.data,
      };
    } catch (err: any) {
      const receivedAt = new Date().toISOString();
      return {
        success: false,
        request_started_at: startedAt,
        response_received_at: receivedAt,
        methodUsed: 'sendText',
        error: err.message,
      };
    }
  }

  /**
   * Send promotional offer via POST /api/messages/sendLinkWithAutoPreview
   * with fallback to sendText if preview generation fails.
   */
  public async sendLinkWithPreview(to: string, url: string, text: string): Promise<SendResult> {
    const startedAt = new Date().toISOString();

    // 1. Attempt sendLinkWithAutoPreview
    try {
      let res = await this.request('/api/messages/sendLinkWithAutoPreview', {
        method: 'POST',
        body: JSON.stringify({ to, url, text }),
      });

      if (!res.ok) {
        // Fallback endpoint structure: POST /sendLinkWithAutoPreview with args: { chatId, url, text }
        res = await this.request('/sendLinkWithAutoPreview', {
          method: 'POST',
          body: JSON.stringify({ args: { chatId: to, url, text } }),
        });
      }

      const receivedAt = new Date().toISOString();

      if (res.ok) {
        const raw = res.data?.response || res.data;
        const messageId =
          typeof raw === 'string'
            ? raw
            : raw?.id?._serialized || raw?.id || raw?.messageId || 'sent-preview';

        return {
          success: true,
          provider_message_id: messageId,
          request_started_at: startedAt,
          response_received_at: receivedAt,
          methodUsed: 'sendLinkWithAutoPreview',
          details: res.data,
        };
      }

      console.warn(
        `sendLinkWithAutoPreview falhou (HTTP ${res.status}). Executando fallback para sendText...`
      );
    } catch (previewErr: any) {
      console.warn(
        `Exceção em sendLinkWithAutoPreview: ${previewErr.message}. Executando fallback para sendText...`
      );
    }

    // 2. Fallback to sendText with full message and url combined
    const fullMessage = `${text}\n\n${url}`.trim();
    const fallbackResult = await this.sendText(to, fullMessage);
    return fallbackResult;
  }

  /**
   * Disconnect/logout
   */
  public async disconnect(): Promise<boolean> {
    try {
      await this.request('/api/session/logout', { method: 'POST' }).catch(() =>
        this.request('/logout', { method: 'POST' })
      );
      return true;
    } catch {
      return false;
    }
  }
}

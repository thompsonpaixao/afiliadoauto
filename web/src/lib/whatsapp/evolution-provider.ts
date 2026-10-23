import { WhatsAppProvider, WhatsAppStatus, WhatsAppGroupData, SendResult } from './types';
import { db } from '../db';

export class EvolutionProvider implements WhatsAppProvider {
  private baseUrl: string;
  private apiKey: string;
  private instance: string;

  constructor() {
    this.baseUrl = (process.env.EVOLUTION_API_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');
    this.apiKey = process.env.EVOLUTION_API_KEY || 'afiliado-auto-secret-key-2026';
    this.instance = process.env.EVOLUTION_INSTANCE || 'afiliado-auto';
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'apikey': this.apiKey,
    };
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<{ ok: boolean; status: number; data: any }> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const headers = {
      ...this.getHeaders(),
      ...(options.headers || {}),
    };

    const response = await fetch(url, {
      ...options,
      cache: 'no-store',
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

  /**
   * Garantir que a instância exista na Evolution API
   */
  private async ensureInstance(): Promise<void> {
    try {
      const res = await this.request(`/instance/connectionState/${this.instance}`, { method: 'GET' });
      if (res.status === 404 || !res.ok) {
        // Criar instância com Baileys
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
      console.warn('Falha ao verificar/criar instância na Evolution API:', e);
    }
  }

  /**
   * Status da conexão
   */
  public async getStatus(): Promise<WhatsAppStatus> {
    try {
      let stateRes;
      try {
        stateRes = await this.request(`/instance/connectionState/${this.instance}`, { method: 'GET' });
      } catch (connErr: any) {
        console.error('[Evolution Provider Connection Error]:', connErr?.message, connErr?.cause);
        return {
          status: 'SERVICE_UNAVAILABLE',
          connected: false,
          endpoint: this.baseUrl,
          instance: this.instance,
          error: `Serviço indisponível (Evolution API offline em ${this.baseUrl}: ${connErr.message})`,
        };
      }

      // Se der 502 / 504 no túnel
      if (stateRes.status === 502 || stateRes.status === 504) {
        return {
          status: 'SERVICE_UNAVAILABLE',
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

      // Se a instância não existir, cria automaticamente
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
        // Tentar obter QR Code ativo
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

  /**
   * Conectar e gerar QR Code
   */
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

  /**
   * Obter QR Code ativo em base64
   */
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

  /**
   * Desconectar instância
   */
  public async disconnect(): Promise<boolean> {
    try {
      const res = await this.request(`/instance/logout/${this.instance}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Buscar todos os grupos da conta no WhatsApp
   */
  public async getGroups(): Promise<WhatsAppGroupData[]> {
    let res = await this.request(`/group/fetchAllGroups/${this.instance}?getParticipants=true`, { method: 'GET' });

    if (!res.ok) {
      // Fallback sem parâmetro
      res = await this.request(`/group/fetchAllGroups/${this.instance}`, { method: 'GET' });
    }

    if (!res.ok) {
      throw new Error(`Evolution API HTTP ${res.status}: ${JSON.stringify(res.data)} ao buscar grupos.`);
    }

    const rawList = Array.isArray(res.data) ? res.data : (res.data?.response || res.data?.groups || []);

    if (!Array.isArray(rawList)) {
      return [];
    }

    const now = new Date().toISOString();

    return rawList
      .filter((g: any) => {
        const id = g.id || g.jid || g.groupJid || '';
        return typeof id === 'string' && id.includes('@g.us');
      })
      .map((g: any) => ({
        provider_group_id: g.id || g.jid || g.groupJid,
        name: g.subject || g.name || 'Grupo sem nome',
        picture_url: g.pictureUrl || g.profilePicUrl || null,
        participants_count: g.size || g.participants?.length || 0,
        synced_at: now,
        active: true,
      }));
  }

  /**
   * Enviar mensagem de texto simples
   */
  public async sendText(to: string, text: string): Promise<SendResult> {
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
        return {
          success: false,
          request_started_at: startedAt,
          response_received_at: receivedAt,
          methodUsed: 'sendText',
          error: `HTTP ${res.status}: ${JSON.stringify(res.data)}`,
          isOffline: res.status === 502 || res.status === 504,
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

  /**
   * Enviar oferta com prévia automática de link (com fallback)
   */
  public async sendLinkWithPreview(to: string, url: string, text: string): Promise<SendResult> {
    const startedAt = new Date().toISOString();
    const cleanUrl = (url || '').trim();
    const urlBase = cleanUrl.split('?')[0];
    const hasUrlAlready = Boolean(cleanUrl && (text.includes(cleanUrl) || (urlBase && text.includes(urlBase))));
    const fullMessage = hasUrlAlready ? text.trim() : `${text}\n\n${cleanUrl}`.trim();

    try {
      // Baileys via Evolution API suporta linkPreview: true no payload de sendText
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
      console.warn('Falha em sendLinkWithAutoPreview na Evolution API, executando fallback...');
    }

    // Fallback garantido para texto comum
    return this.sendText(to, fullMessage);
  }

  /**
   * Enviar imagem com legenda (caption) em um único disparo elegante
   */
  public async sendMedia(to: string, mediaUrl: string, caption: string = ''): Promise<SendResult> {
    const startedAt = new Date().toISOString();

    try {
      const res = await this.request(`/message/sendMedia/${this.instance}`, {
        method: 'POST',
        body: JSON.stringify({
          number: to,
          media: mediaUrl,
          mediatype: 'image',
          caption: caption.trim(),
        }),
      });

      const receivedAt = new Date().toISOString();

      if (res.ok) {
        const messageId = res.data?.key?.id || res.data?.id || 'sent-media';
        return {
          success: true,
          provider_message_id: messageId,
          request_started_at: startedAt,
          response_received_at: receivedAt,
          methodUsed: 'sendMedia',
        };
      } else {
        console.warn(`[Evolution Provider] sendMedia returned ${res.status}:`, res.data);
      }
    } catch (err: any) {
      console.warn('[Evolution Provider] sendMedia error, falling back to text:', err.message);
    }

    // Fallback if media sending fails: send text/link preview
    return this.sendText(to, caption);
  }

  /**
   * Sincronizar grupos e atualizar no banco operacional
   */
  public async syncGroups(): Promise<{ syncedCount: number; groups: WhatsAppGroupData[] }> {
    const fetchedGroups = await this.getGroups();
    const now = new Date().toISOString();

    db.update((d) => {
      const fetchedIds = new Set(fetchedGroups.map((g) => g.provider_group_id));

      for (const g of fetchedGroups) {
        const idx = d.whatsapp_groups.findIndex(
          (wg) => (wg.provider_group_id || wg.groupJid) === g.provider_group_id
        );

        if (idx >= 0) {
          d.whatsapp_groups[idx] = {
            ...d.whatsapp_groups[idx],
            provider_group_id: g.provider_group_id,
            groupJid: g.provider_group_id,
            name: g.name,
            picture_url: g.picture_url || d.whatsapp_groups[idx].picture_url,
            imageUrl: g.picture_url || d.whatsapp_groups[idx].imageUrl,
            participants_count: g.participants_count ?? 0,
            participantsCount: g.participants_count ?? 0,
            synced_at: now,
            lastSync: now,
            active: true,
            updatedAt: now,
          };
        } else {
          d.whatsapp_groups.push({
            id: `grp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            provider_group_id: g.provider_group_id,
            groupJid: g.provider_group_id,
            name: g.name,
            picture_url: g.picture_url || null,
            imageUrl: g.picture_url || null,
            participants_count: g.participants_count || 0,
            participantsCount: g.participants_count || 0,
            synced_at: now,
            lastSync: now,
            active: true,
            updatedAt: now,
          });
        }
      }

      // Marcar ausentes como inativos
      d.whatsapp_groups.forEach((wg) => {
        const id = wg.provider_group_id || wg.groupJid || '';
        if (id && !fetchedIds.has(id)) {
          wg.active = false;
          wg.updatedAt = now;
        }
      });

      // Atualizar integração
      const waIntegration = d.integrations.find((i) => i.provider === 'whatsapp');
      if (waIntegration) {
        waIntegration.lastSync = now;
        waIntegration.status = 'connected';
      }

      d.activity_logs.unshift({
        id: `log-${Date.now()}`,
        type: 'whatsapp',
        description: `Sincronização concluída: ${fetchedGroups.length} grupo(s) reais do WhatsApp sincronizados via Evolution API.`,
        createdAt: now,
      });
    });

    return {
      syncedCount: fetchedGroups.length,
      groups: fetchedGroups,
    };
  }
}

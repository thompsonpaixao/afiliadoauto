const QRCode = require('qrcode');

class WhatsAppProvider {
  constructor(config = {}) {
    this.config = config;
    this.client = null;
    this.status = 'DISCONNECTED'; // DISCONNECTED, INITIALIZING, QR_READY, CONNECTED
    this.qrCode = null;
    this.qrRaw = null;
    this.accountInfo = {
      phone: null,
      pushname: null,
      wid: null,
      lastSync: null,
    };
    this.lastError = null;
  }

  getStatus() {
    return {
      status: this.status,
      qrCode: this.qrCode,
      accountInfo: this.accountInfo,
      lastError: this.lastError,
      timestamp: new Date().toISOString()
    };
  }

  async start() {
    if (this.status === 'CONNECTED' && this.client) {
      return { success: true, message: 'Already connected', status: this.status };
    }

    this.status = 'INITIALIZING';
    this.lastError = null;
    this.qrCode = null;

    try {
      // Dynamic import / require of open-wa to allow graceful degradation
      let openwa;
      try {
        openwa = require('@open-wa/wa-automate');
      } catch (err) {
        console.warn('⚠️ @open-wa/wa-automate is not yet installed or failed to load. Operating in standby mode.');
        this.status = 'DISCONNECTED';
        this.lastError = 'OpenWA package not loaded. Run npm install in whatsapp-worker.';
        return { success: false, error: this.lastError };
      }

      console.log('🚀 Starting OpenWA session: afiliado-auto-session...');

      const client = await openwa.create({
        sessionId: 'afiliado-auto-session',
        multiDevice: true,
        authTimeout: 60,
        blockCrashLogs: true,
        disableSpins: true,
        headless: true,
        hostNotificationBars: false,
        logConsole: false,
        popup: false,
        qrTimeout: 0,
        restartOnCrash: true,
        useChrome: true,
        chromiumArgs: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ],
        qrRefreshS: 20,
        cacheEnabled: true,
        notification: {
          title: 'Afiliado Auto WhatsApp',
          text: 'Conexão ativa'
        }
      }, (base64Qr, asciiQR, urlCode) => {
        console.log('📱 QR Code received from WhatsApp');
        this.status = 'QR_READY';
        this.qrRaw = urlCode;
        if (base64Qr) {
          this.qrCode = base64Qr.startsWith('data:') ? base64Qr : `data:image/png;base64,${base64Qr}`;
        }
      }, (statusSession) => {
        console.log('🔄 Session status update:', statusSession);
        if (statusSession === 'isLogged' || statusSession === 'qrReadSuccess') {
          this.status = 'CONNECTED';
          this.qrCode = null;
        } else if (statusSession === 'notLogged' || statusSession === 'browserClose') {
          this.status = 'DISCONNECTED';
        }
      });

      this.client = client;

      // Check state
      const isConnected = await client.isConnected();
      if (isConnected) {
        this.status = 'CONNECTED';
        this.qrCode = null;
        await this.refreshAccountInfo();
      }

      // State listener
      client.onStateChanged((state) => {
        console.log('⚡ WhatsApp client state changed:', state);
        if (state === 'CONFLICT' || state === 'UNLAUNCHED') {
          client.forceRefocus();
        }
        if (state === 'CONNECTED') {
          this.status = 'CONNECTED';
          this.qrCode = null;
          this.refreshAccountInfo().catch(console.error);
        } else if (state === 'DISCONNECTED') {
          this.status = 'DISCONNECTED';
        }
      });

      return { success: true, status: this.status };
    } catch (err) {
      console.error('❌ Failed to start WhatsApp session:', err.message);
      this.status = 'DISCONNECTED';
      this.lastError = err.message;
      return { success: false, error: err.message };
    }
  }

  async refreshAccountInfo() {
    if (!this.client) return;
    try {
      const me = await this.client.getMe();
      const hostNumber = await this.client.getHostNumber();
      this.accountInfo = {
        phone: hostNumber || me?.id?.user || 'Conectado',
        pushname: me?.pushname || 'Afiliado Auto Admin',
        wid: me?.id?._serialized || null,
        lastSync: new Date().toISOString()
      };
      this.status = 'CONNECTED';
    } catch (e) {
      console.error('Failed to get host info:', e.message);
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.logout();
        await this.client.kill();
        this.client = null;
      }
      this.status = 'DISCONNECTED';
      this.qrCode = null;
      this.accountInfo = {
        phone: null,
        pushname: null,
        wid: null,
        lastSync: null
      };
      return { success: true };
    } catch (err) {
      this.lastError = err.message;
      return { success: false, error: err.message };
    }
  }

  async getGroups() {
    if (this.status !== 'CONNECTED' || !this.client) {
      throw new Error('WhatsApp não está conectado');
    }

    try {
      const chats = await this.client.getAllGroups();
      const groups = chats.map((chat) => ({
        groupJid: chat.id._serialized || chat.id,
        name: chat.name || chat.formattedTitle || 'Grupo sem nome',
        participantsCount: chat.groupMetadata?.participants?.length || chat.participants?.length || 0,
        imageUrl: chat.contact?.profilePicThumbObj?.eurl || null,
        lastSync: new Date().toISOString()
      }));

      await this.refreshAccountInfo();
      return groups;
    } catch (err) {
      console.error('Erro ao buscar grupos:', err.message);
      throw err;
    }
  }

  async sendLinkMessage({ to, message, link, autoPreview = true }) {
    if (this.status !== 'CONNECTED' || !this.client) {
      throw new Error('WhatsApp não está conectado');
    }

    try {
      let result;
      // Try sending with auto preview if requested and link is available
      if (autoPreview && link && typeof this.client.sendLinkWithAutoPreview === 'function') {
        try {
          result = await this.client.sendLinkWithAutoPreview(to, link, message);
        } catch (previewErr) {
          console.warn('sendLinkWithAutoPreview falhou, recorrendo a sendText:', previewErr.message);
          result = await this.client.sendText(to, message);
        }
      } else {
        result = await this.client.sendText(to, message);
      }

      return {
        success: true,
        messageId: result?.id || (typeof result === 'string' ? result : 'sent'),
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      console.error(`Erro ao enviar mensagem para ${to}:`, err.message);
      throw err;
    }
  }
}

module.exports = { WhatsAppProvider };

const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
} = require('@whiskeysockets/baileys');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;
const API_KEY = process.env.AUTHENTICATION_API_KEY || process.env.EVOLUTION_API_KEY || 'afiliado-auto-secret-key-2026';
const AUTH_DIR = path.join(__dirname, '..', '.evolution_instances');

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

// In-memory instance state manager
const instances = new Map();

// In-memory message store for monitoring / clone engine
const recentMessages = [];
const MAX_RECENT_MESSAGES = 1000;

// API Key authentication middleware
app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/') return next();

  const apiKeyHeader = req.headers['apikey'] || req.headers['x-api-key'] || req.query.apikey;
  if (!apiKeyHeader || apiKeyHeader !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid apikey header' });
  }
  next();
});

// Root & Health
app.get('/', (req, res) => res.json({ name: 'Evolution API (Baileys Engine)', version: '2.1.3', status: 'online' }));
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

async function getOrCreateInstance(instanceName = 'afiliado-auto') {
  if (instances.has(instanceName)) {
    return instances.get(instanceName);
  }

  const sessionPath = path.join(AUTH_DIR, instanceName);
  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

  const instanceState = {
    name: instanceName,
    state: 'connecting', // 'open' | 'connecting' | 'close'
    sock: null,
    qrCodeBase64: null,
    qrCodeRaw: null,
    user: null,
    lastDisconnect: null,
  };

  const logger = pino({ level: 'silent' });

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: true,
    auth: state,
    browser: ['Afiliado Auto', 'Chrome', '1.0.0'],
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
  });

  instanceState.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      instanceState.qrCodeRaw = qr;
      instanceState.qrCodeBase64 = await qrcode.toDataURL(qr);
      console.log(`[Evolution] QR Code gerado para a instância "${instanceName}". Escaneie no WhatsApp.`);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      instanceState.state = 'close';
      instanceState.lastDisconnect = lastDisconnect;
      console.log(`[Evolution] Conexão fechada para "${instanceName}". Reconectar: ${shouldReconnect} (código ${statusCode})`);

      if (shouldReconnect) {
        setTimeout(() => {
          instances.delete(instanceName);
          getOrCreateInstance(instanceName);
        }, 3000);
      } else {
        // Logged out: remove session folder
        try {
          fs.rmSync(sessionPath, { recursive: true, force: true });
        } catch {}
        instances.delete(instanceName);
      }
    } else if (connection === 'open') {
      instanceState.state = 'open';
      instanceState.qrCodeBase64 = null;
      instanceState.qrCodeRaw = null;
      instanceState.user = sock.user;
      console.log(`[Evolution] WhatsApp conectado com sucesso para "${instanceName}"! Usuário:`, sock.user?.id);
    }
  });

  // Listen for incoming messages for monitoring / clone engine
  sock.ev.on('messages.upsert', async (m) => {
    try {
      if (!m.messages || !Array.isArray(m.messages)) return;

      for (const msg of m.messages) {
        if (!msg.message) continue;

        const remoteJid = msg.key?.remoteJid;
        if (!remoteJid) continue;

        const fromMe = Boolean(msg.key?.fromMe);
        const messageId = msg.key?.id;
        const timestamp = (Number(msg.messageTimestamp) * 1000) || Date.now();

        let text = '';
        if (msg.message.conversation) {
          text = msg.message.conversation;
        } else if (msg.message.extendedTextMessage?.text) {
          text = msg.message.extendedTextMessage.text;
        } else if (msg.message.imageMessage?.caption) {
          text = msg.message.imageMessage.caption;
        } else if (msg.message.videoMessage?.caption) {
          text = msg.message.videoMessage.caption;
        } else if (msg.message.documentMessage?.caption) {
          text = msg.message.documentMessage.caption;
        }

        if (!text || !text.trim()) continue;

        recentMessages.push({
          instance: instanceName,
          id: messageId,
          remoteJid,
          fromMe,
          participant: msg.key?.participant || remoteJid,
          pushName: msg.pushName || '',
          text: text.trim(),
          timestamp,
        });

        if (recentMessages.length > MAX_RECENT_MESSAGES) {
          recentMessages.shift();
        }
      }
    } catch (err) {
      console.error(`[Evolution] Error in messages.upsert for "${instanceName}":`, err.message);
    }
  });

  instances.set(instanceName, instanceState);
  return instanceState;
}

// -----------------------------------------------------------------------------
// EVOLUTION API SPECIFICATION ENDPOINTS
// -----------------------------------------------------------------------------

// POST /instance/create
app.post('/instance/create', async (req, res) => {
  try {
    const instanceName = req.body?.instanceName || 'afiliado-auto';
    const inst = await getOrCreateInstance(instanceName);
    return res.status(201).json({
      instance: {
        instanceName,
        state: inst.state,
      },
      qrcode: {
        base64: inst.qrCodeBase64,
        code: inst.qrCodeRaw,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /instance/connectionState/:instance
app.get('/instance/connectionState/:instance', async (req, res) => {
  try {
    const instanceName = req.params.instance;
    let inst = instances.get(instanceName);

    if (!inst) {
      inst = await getOrCreateInstance(instanceName);
    }

    const ownerJid = inst.user?.id || (inst.sock?.user?.id);
    const number = ownerJid ? ownerJid.split(':')[0].split('@')[0] : null;

    return res.json({
      instance: {
        instanceName,
        state: inst.state,
        ownerJid,
        number,
        profileName: inst.user?.name || 'Afiliado Auto Admin',
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /instance/connect/:instance
app.get('/instance/connect/:instance', async (req, res) => {
  try {
    const instanceName = req.params.instance;
    let inst = instances.get(instanceName);

    if (!inst) {
      inst = await getOrCreateInstance(instanceName);
    }

    if (inst.state === 'open') {
      return res.json({
        instance: {
          instanceName,
          state: 'open',
        },
      });
    }

    return res.json({
      instance: {
        instanceName,
        state: inst.state,
      },
      base64: inst.qrCodeBase64,
      code: inst.qrCodeRaw,
      count: 1,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /instance/logout/:instance
app.delete('/instance/logout/:instance', async (req, res) => {
  const instanceName = req.params.instance;
  const inst = instances.get(instanceName);

  if (inst && inst.sock) {
    try {
      await inst.sock.logout();
    } catch {}
    instances.delete(instanceName);
  }

  const sessionPath = path.join(AUTH_DIR, instanceName);
  try {
    fs.rmSync(sessionPath, { recursive: true, force: true });
  } catch {}

  return res.json({ success: true, message: 'Logged out successfully' });
});

// DELETE /instance/delete/:instance
app.delete('/instance/delete/:instance', async (req, res) => {
  const instanceName = req.params.instance;
  const inst = instances.get(instanceName);
  if (inst && inst.sock) {
    try { await inst.sock.end(); } catch {}
    instances.delete(instanceName);
  }
  const sessionPath = path.join(AUTH_DIR, instanceName);
  try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch {}
  return res.json({ success: true, message: 'Instance deleted' });
});

// GET /group/fetchAllGroups/:instance
app.get('/group/fetchAllGroups/:instance', async (req, res) => {
  const instanceName = req.params.instance;
  const inst = instances.get(instanceName);

  if (!inst || inst.state !== 'open' || !inst.sock) {
    return res.status(400).json({ error: 'Instance is not connected' });
  }

  try {
    const groupsMap = await inst.sock.groupFetchAllParticipating();
    const groupList = Object.values(groupsMap).map((g) => ({
      id: g.id,
      subject: g.subject || 'Grupo sem nome',
      owner: g.owner,
      creation: g.creation,
      size: g.participants?.length || 0,
      participants: g.participants || [],
    }));

    return res.json(groupList);
  } catch (err) {
    return res.status(500).json({ error: `Failed to fetch groups: ${err.message}` });
  }
});

// POST /message/sendText/:instance
app.post('/message/sendText/:instance', async (req, res) => {
  const instanceName = req.params.instance;
  const { number, text, linkPreview = false, media, mediatype } = req.body;

  if (!number || (!text && !media)) {
    return res.status(400).json({ error: 'Fields "number" and "text" (or "media") are required.' });
  }

  const inst = instances.get(instanceName);
  if (!inst || inst.state !== 'open' || !inst.sock) {
    return res.status(400).json({ error: 'WhatsApp instance is not connected. Scan QR code first.' });
  }

  try {
    let targetJid = number.trim();
    if (!targetJid.includes('@')) {
      targetJid = `${targetJid}@s.whatsapp.net`;
    }

    let payload;
    if (media) {
      payload = {
        image: { url: media },
        caption: text ? text.trim() : undefined,
      };
    } else {
      payload = {
        text: text.trim(),
      };
    }

    const sent = await inst.sock.sendMessage(targetJid, payload);

    return res.json({
      key: {
        remoteJid: targetJid,
        fromMe: true,
        id: sent?.key?.id || `msg-${Date.now()}`,
      },
      message: {
        conversation: text,
      },
      status: 'PENDING',
    });
  } catch (err) {
    console.error(`[Evolution] Error sending message to ${number}:`, err);
    return res.status(500).json({ error: `Failed to send message: ${err.message}` });
  }
});

// POST /message/sendMedia/:instance
app.post('/message/sendMedia/:instance', async (req, res) => {
  const instanceName = req.params.instance;
  const { number, media, mediatype = 'image', caption = '', fileName } = req.body;

  if (!number || !media) {
    return res.status(400).json({ error: 'Fields "number" and "media" (URL or base64) are required.' });
  }

  const inst = instances.get(instanceName);
  if (!inst || inst.state !== 'open' || !inst.sock) {
    return res.status(400).json({ error: 'WhatsApp instance is not connected. Scan QR code first.' });
  }

  try {
    let targetJid = number.trim();
    if (!targetJid.includes('@')) {
      targetJid = `${targetJid}@s.whatsapp.net`;
    }

    let payload;
    if (mediatype === 'image') {
      payload = {
        image: { url: media },
        caption: caption ? caption.trim() : undefined,
      };
    } else {
      payload = {
        document: { url: media },
        caption: caption ? caption.trim() : undefined,
        fileName: fileName || 'file',
      };
    }

    const sent = await inst.sock.sendMessage(targetJid, payload);

    return res.json({
      key: {
        remoteJid: targetJid,
        fromMe: true,
        id: sent?.key?.id || `msg-${Date.now()}`,
      },
      message: {
        caption,
      },
      status: 'PENDING',
    });
  } catch (err) {
    console.error(`[Evolution] Error sending media to ${number}:`, err);
    return res.status(500).json({ error: `Failed to send media: ${err.message}` });
  }
});

// GET /messages/recent/:instance
app.get('/messages/recent/:instance', async (req, res) => {
  try {
    const instanceName = req.params.instance;
    const { jid, since, limit = 50 } = req.query;

    let filtered = recentMessages.filter((m) => m.instance === instanceName);

    if (jid) {
      const cleanJid = String(jid).trim();
      filtered = filtered.filter((m) => {
        return (
          m.remoteJid === cleanJid ||
          m.remoteJid.replace('@g.us', '') === cleanJid.replace('@g.us', '') ||
          m.remoteJid.replace('@s.whatsapp.net', '') === cleanJid.replace('@s.whatsapp.net', '')
        );
      });
    }

    if (since) {
      const sinceMs = Number(since);
      if (!isNaN(sinceMs) && sinceMs > 0) {
        filtered = filtered.filter((m) => m.timestamp > sinceMs);
      }
    }

    // Sort newest first
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    const lim = Math.min(200, Math.max(1, Number(limit) || 50));
    const result = filtered.slice(0, lim);

    return res.json({
      success: true,
      instance: instanceName,
      total: result.length,
      messages: result,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Auto-start default instance
getOrCreateInstance('afiliado-auto').catch(console.error);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`========================================================`);
  console.log(`  Evolution API (Baileys Engine) rodando na porta ${PORT}`);
  console.log(`  API Key: ${API_KEY}`);
  console.log(`  Instância padrão: afiliado-auto`);
  console.log(`  Health check: http://127.0.0.1:${PORT}/health`);
  console.log(`========================================================`);
});

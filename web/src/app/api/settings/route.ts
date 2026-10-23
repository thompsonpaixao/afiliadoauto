import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { updateAdmin } from '@/lib/auth';
import { ShopeeAffiliateClient } from '@/lib/shopee';
import { getWhatsAppProvider } from '@/lib/whatsapp';

export async function GET() {
  try {
    const data = db.read();
    const shopee = data.integrations.find((i) => i.provider === 'shopee');
    const whatsapp = data.integrations.find((i) => i.provider === 'whatsapp');
    const admin = data.admins[0];

    return NextResponse.json({
      success: true,
      admin: {
        username: admin?.username || 'admin',
      },
      shopee: {
        appId: shopee?.credentials?.appId || '',
        appSecret: shopee?.credentials?.appSecret ? '••••••••••••••••' : '',
        endpoint: shopee?.credentials?.endpoint || 'https://open-api.affiliate.shopee.com.br/graphql',
        hasSecret: Boolean(shopee?.credentials?.appSecret),
        status: shopee?.status || 'disconnected',
      },
      whatsapp: {
        endpoint: whatsapp?.credentials?.endpoint || 'http://127.0.0.1:8080',
        apiKey: whatsapp?.credentials?.apiKey ? '••••••••' : '',
        hasKey: Boolean(whatsapp?.credentials?.apiKey),
        sessionId: whatsapp?.credentials?.sessionId || 'afiliado-auto',
        status: whatsapp?.status || 'disconnected',
        lastSync: whatsapp?.lastSync || null,
      },
      settings: data.settings,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { section, payload } = body;
    const now = new Date().toISOString();

    if (section === 'admin') {
      const { username, currentPassword, newPassword } = payload;
      const res = updateAdmin(username, newPassword);
      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }
      return NextResponse.json({ success: true, message: 'Dados do administrador atualizados com sucesso.' });
    }

    if (section === 'shopee') {
      const { appId, appSecret, endpoint } = payload;
      db.update((d) => {
        const shopee = d.integrations.find((i) => i.provider === 'shopee');
        if (shopee) {
          shopee.credentials.appId = appId !== undefined ? appId.trim() : shopee.credentials.appId;
          if (appSecret && appSecret !== '••••••••••••••••') {
            shopee.credentials.appSecret = appSecret.trim();
          }
          if (endpoint) {
            shopee.credentials.endpoint = endpoint.trim();
          }
          shopee.status = (shopee.credentials.appId && shopee.credentials.appSecret) ? 'connected' : 'disconnected';
          shopee.updatedAt = now;
        }
      });
      return NextResponse.json({ success: true, message: 'Credenciais da Shopee salvas com sucesso.' });
    }

    if (section === 'whatsapp') {
      const { endpoint, apiKey, sessionId } = payload;
      db.update((d) => {
        const wa = d.integrations.find((i) => i.provider === 'whatsapp');
        if (wa) {
          if (endpoint) wa.credentials.endpoint = endpoint.trim();
          if (apiKey && apiKey !== '••••••••') wa.credentials.apiKey = apiKey.trim();
          if (sessionId) wa.credentials.sessionId = sessionId.trim();
          wa.updatedAt = now;
        }
      });
      return NextResponse.json({ success: true, message: 'Configurações do WhatsApp salvas com sucesso.' });
    }

    if (section === 'general') {
      const { timezone, defaultTemplate } = payload;
      db.update((d) => {
        if (timezone) d.settings.timezone = timezone;
        if (defaultTemplate) d.settings.defaultTemplate = defaultTemplate;
      });
      return NextResponse.json({ success: true, message: 'Configurações gerais salvas.' });
    }

    if (section === 'test_whatsapp') {
      const provider = getWhatsAppProvider();
      const status = await provider.getStatus();
      return NextResponse.json({ success: status.connected, status });
    }

    return NextResponse.json({ error: 'Seção não reconhecida' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

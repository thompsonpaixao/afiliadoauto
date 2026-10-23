import { NextRequest, NextResponse } from 'next/server';
import { getWhatsAppProvider } from '@/lib/whatsapp';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { to, message, url } = await req.json();

    if (!to || !to.trim()) {
      return NextResponse.json(
        { error: 'O identificador do grupo (provider_group_id) é obrigatório.' },
        { status: 400 }
      );
    }

    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: 'O conteúdo da mensagem é obrigatório.' },
        { status: 400 }
      );
    }

    const provider = getWhatsAppProvider();
    const cleanTo = to.trim();
    const cleanMessage = message.trim();
    const cleanUrl = url && url.trim() ? url.trim() : null;

    let result;
    if (cleanUrl) {
      result = await provider.sendLinkWithPreview(cleanTo, cleanUrl, cleanMessage);
    } else {
      result = await provider.sendText(cleanTo, cleanMessage);
    }

    const data = db.read();
    const groupInfo = data.whatsapp_groups.find(
      (g) => (g.provider_group_id || g.groupJid) === cleanTo
    );
    const groupName = groupInfo?.name || cleanTo;
    const now = new Date().toISOString();

    // Register job in database
    db.update((d) => {
      d.message_jobs.unshift({
        id: `test-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        automationId: 'manual-test',
        cycleId: 1,
        productId: 'test-product',
        productName: 'Disparo de Teste Manual',
        whatsappGroupJid: cleanTo,
        provider_group_id: cleanTo,
        groupName,
        idempotentKey: `manual-test:${Date.now()}:${cleanTo}`,
        status: result.success ? 'sent' : 'failed',
        linkUsed: cleanUrl || '',
        messageContent: cleanMessage,
        scheduledFor: now,
        sentAt: result.success ? now : null,
        request_started_at: result.request_started_at,
        response_received_at: result.response_received_at,
        provider_message_id: result.provider_message_id,
        error: result.error || null,
        attempts: 1,
        createdAt: now,
        updatedAt: now,
      });

      d.activity_logs.unshift({
        id: `log-${Date.now()}`,
        type: 'whatsapp',
        description: result.success
          ? `Mensagem de teste enviada para "${groupName}" via ${result.methodUsed}.`
          : `Falha no teste para "${groupName}": ${result.error}`,
        createdAt: now,
      });
    });

    return NextResponse.json({
      success: result.success,
      result,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      { status: 500 }
    );
  }
}

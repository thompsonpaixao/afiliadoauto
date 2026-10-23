import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const data = db.read();
    const items = data.clone_items || [];
    const config = data.clone_config;

    const metrics = {
      totalCaptured: items.filter((i) => i.status !== 'ignored').length,
      waitingApproval: items.filter((i) => i.status === 'waiting_approval').length,
      approved: items.filter((i) => i.status === 'approved').length,
      autoAdded: items.filter((i) => i.status === 'auto_added').length,
      ignored: items.filter((i) => i.status === 'ignored').length,
      errors: items.filter((i) => i.status === 'error').length,
      lastProcessedTimestamp: config?.lastProcessedTimestamp || null,
      lastProcessedMessageId: config?.lastProcessedMessageId || null,
      activatedAt: config?.activatedAt || null,
      isActive: Boolean(config?.active),
    };

    return NextResponse.json({
      success: true,
      items,
      metrics,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { id, all, clearIgnored } = body;

    db.update((d) => {
      if (!d.clone_items) d.clone_items = [];

      if (all) {
        d.clone_items = [];
      } else if (clearIgnored) {
        d.clone_items = d.clone_items.filter((i) => i.status !== 'ignored');
      } else if (id) {
        d.clone_items = d.clone_items.filter((i) => i.id !== id);
      }
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

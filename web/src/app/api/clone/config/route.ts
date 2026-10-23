import { NextRequest, NextResponse } from 'next/server';
import { db, CloneConfig } from '@/lib/db';

export async function GET() {
  try {
    const data = db.read();
    const config = data.clone_config || {
      active: false,
      sourceGroupJid: '',
      sourceGroupName: '',
      mode: 'manual_approval',
      targetAutomationId: null,
      subIds: [],
      antiLoopHours: 24,
      activatedAt: null,
      lastProcessedTimestamp: null,
      lastProcessedMessageId: null,
    };
    return NextResponse.json({ success: true, config });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      active,
      sourceGroupJid,
      sourceGroupName,
      mode = 'manual_approval',
      targetAutomationId,
      subIds,
      antiLoopHours = 24,
    } = body;

    const now = new Date().toISOString();

    db.update((d) => {
      const prev = d.clone_config;
      const wasActive = prev?.active;
      const isNowActive = Boolean(active);

      // If activating now or changing source group, set/reset activatedAt to now
      let activatedAt = prev?.activatedAt || null;
      let lastProcessedTimestamp = prev?.lastProcessedTimestamp || null;

      if (isNowActive && (!wasActive || (sourceGroupJid && sourceGroupJid !== prev?.sourceGroupJid))) {
        activatedAt = now;
        lastProcessedTimestamp = Date.now();
      } else if (!isNowActive) {
        activatedAt = null;
      }

      const cleanSubIds = Array.isArray(subIds)
        ? subIds.map((s) => String(s).trim().replace(/[^a-zA-Z0-9]/g, '')).filter(Boolean).slice(0, 5)
        : prev?.subIds || [];

      const updatedConfig: CloneConfig = {
        active: isNowActive,
        sourceGroupJid: sourceGroupJid !== undefined ? String(sourceGroupJid).trim() : (prev?.sourceGroupJid || ''),
        sourceGroupName: sourceGroupName !== undefined ? String(sourceGroupName).trim() : (prev?.sourceGroupName || ''),
        mode: mode === 'auto_automation' ? 'auto_automation' : 'manual_approval',
        targetAutomationId: targetAutomationId !== undefined ? targetAutomationId : (prev?.targetAutomationId || null),
        subIds: cleanSubIds,
        antiLoopHours: Math.max(1, Number(antiLoopHours) || 24),
        activatedAt,
        lastProcessedTimestamp,
        lastProcessedMessageId: prev?.lastProcessedMessageId || null,
        createdAt: prev?.createdAt || now,
        updatedAt: now,
      };

      d.clone_config = updatedConfig;

      d.activity_logs.unshift({
        id: `log-${Date.now()}`,
        type: 'clone',
        description: `Configurações do Clone atualizadas. Monitoramento: ${isNowActive ? 'ATIVO' : 'INATIVO'}.`,
        createdAt: now,
      });
    });

    return NextResponse.json({ success: true, config: db.read().clone_config });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

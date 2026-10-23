import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const data = db.read();
    const groups = data.whatsapp_groups.map((g) => ({
      provider_group_id: g.provider_group_id || g.groupJid,
      name: g.name,
      picture_url: g.picture_url || g.imageUrl || null,
      participants_count: g.participants_count ?? g.participantsCount ?? null,
      synced_at: g.synced_at || g.lastSync || g.updatedAt,
      active: g.active !== false,
    }));

    return NextResponse.json({
      success: true,
      total: groups.length,
      groups,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

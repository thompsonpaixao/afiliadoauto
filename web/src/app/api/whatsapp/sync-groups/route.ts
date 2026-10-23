import { NextResponse } from 'next/server';
import { getWhatsAppProvider } from '@/lib/whatsapp';

export async function POST() {
  try {
    const provider = getWhatsAppProvider();
    const result = await provider.syncGroups();

    return NextResponse.json({
      success: true,
      syncedCount: result.syncedCount,
      groups: result.groups,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Falha ao sincronizar grupos no OpenWA',
      },
      { status: 500 }
    );
  }
}

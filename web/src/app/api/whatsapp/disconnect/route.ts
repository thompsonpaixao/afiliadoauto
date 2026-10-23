import { NextResponse } from 'next/server';
import { getWhatsAppProvider } from '@/lib/whatsapp';

export async function POST() {
  try {
    const provider = getWhatsAppProvider();
    const success = await provider.disconnect();
    return NextResponse.json({ success });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

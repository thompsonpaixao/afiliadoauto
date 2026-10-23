import { NextResponse } from 'next/server';
import { getWhatsAppProvider } from '@/lib/whatsapp';

export async function POST() {
  try {
    const provider = getWhatsAppProvider();
    const result = await provider.connect();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

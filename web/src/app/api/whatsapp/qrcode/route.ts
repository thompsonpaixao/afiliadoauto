import { NextResponse } from 'next/server';
import { getWhatsAppProvider } from '@/lib/whatsapp';

export async function GET() {
  try {
    const provider = getWhatsAppProvider();
    const qrCode = await provider.getQrCode();
    return NextResponse.json({ success: Boolean(qrCode), qrCode });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

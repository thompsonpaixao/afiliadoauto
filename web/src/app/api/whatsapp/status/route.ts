import { NextResponse } from 'next/server';
import { getWhatsAppProvider } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const provider = getWhatsAppProvider();
    const status = await provider.getStatus();
    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 'SERVICE_UNAVAILABLE',
        connected: false,
        error: err.message,
      },
      { status: 500 }
    );
  }
}

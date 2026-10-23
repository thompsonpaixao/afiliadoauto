import { NextRequest, NextResponse } from 'next/server';
import { CloneService } from '@/lib/clone-service';

export async function POST(req: NextRequest) {
  try {
    const { itemId, targetAutomationId } = await req.json();

    if (!itemId) {
      return NextResponse.json({ error: 'itemId é obrigatório.' }, { status: 400 });
    }

    const result = await CloneService.approveItem(itemId, targetAutomationId);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

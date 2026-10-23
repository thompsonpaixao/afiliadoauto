import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { SchedulerService } from '@/lib/scheduler';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const data = db.read();
    const automation = data.automations.find((a) => a.id === id);

    if (!automation) {
      return NextResponse.json({ error: 'Automação não encontrada' }, { status: 404 });
    }

    if (SchedulerService.isAutomationLocked(id)) {
      return NextResponse.json(
        { success: false, error: 'Envio já em andamento para esta automação. Aguarde o disparo atual finalizar.' },
        { status: 409 }
      );
    }

    const success = await SchedulerService.dispatchAutomation(automation);
    return NextResponse.json({ success });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

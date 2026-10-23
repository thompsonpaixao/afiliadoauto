import { NextResponse } from 'next/server';
import { SchedulerService } from '@/lib/scheduler';
import { CloneService } from '@/lib/clone-service';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const result = await SchedulerService.tick();

    // Check if clone monitoring is active
    let cloneResult = null;
    try {
      const data = db.read();
      if (data.clone_config?.active) {
        cloneResult = await CloneService.pollAndProcess();
      }
    } catch (cloneErr: any) {
      console.error('[Tick] Erro ao executar CloneService:', cloneErr.message);
    }

    return NextResponse.json({
      success: true,
      ...result,
      clone: cloneResult,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}

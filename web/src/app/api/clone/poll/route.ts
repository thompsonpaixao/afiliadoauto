import { NextResponse } from 'next/server';
import { CloneService } from '@/lib/clone-service';

export async function POST() {
  try {
    const result = await CloneService.pollAndProcess();
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

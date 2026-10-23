import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { SchedulerService } from '@/lib/scheduler';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'all';
    const period = searchParams.get('period') || 'all';
    const groupId = searchParams.get('groupId') || 'all';
    const automationId = searchParams.get('automationId') || 'all';

    const data = db.read();
    let jobs = data.message_jobs;

    // Filter by status
    if (status === 'sent') {
      jobs = jobs.filter((j) => j.status === 'sent');
    } else if (status === 'error' || status === 'failed') {
      jobs = jobs.filter((j) => j.status === 'failed' || (j.status as any) === 'error');
    }

    // Filter by automation
    if (automationId !== 'all') {
      jobs = jobs.filter((j) => j.automationId === automationId);
    }

    // Filter by group
    if (groupId !== 'all') {
      jobs = jobs.filter((j) => j.whatsappGroupJid === groupId);
    }

    // Filter by period
    const now = new Date();
    if (period === 'today') {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      jobs = jobs.filter((j) => new Date(j.createdAt).getTime() >= todayStart);
    } else if (period === '7d') {
      const past7d = now.getTime() - 7 * 24 * 60 * 60 * 1000;
      jobs = jobs.filter((j) => new Date(j.createdAt).getTime() >= past7d);
    } else if (period === '30d') {
      const past30d = now.getTime() - 30 * 24 * 60 * 60 * 1000;
      jobs = jobs.filter((j) => new Date(j.createdAt).getTime() >= past30d);
    }

    return NextResponse.json({
      success: true,
      jobs,
      totalCount: jobs.length,
      sentCount: jobs.filter((j) => j.status === 'sent').length,
      errorCount: jobs.filter((j) => j.status === 'failed' || (j.status as any) === 'error').length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { jobId } = await req.json();
    if (!jobId) {
      return NextResponse.json({ error: 'ID do disparo não fornecido.' }, { status: 400 });
    }

    const result = await SchedulerService.retryJob(jobId);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

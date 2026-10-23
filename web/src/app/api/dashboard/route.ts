import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ShopeeAffiliateClient } from '@/lib/shopee';

export async function GET() {
  try {
    const data = db.read();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    // Top metrics
    const availableProducts = data.products.filter((p) => p.status === 'available').length;
    const waitingProducts = data.products.filter((p) => p.status === 'waiting').length;
    const postedToday = data.message_jobs.filter(
      (j) => j.status === 'sent' && new Date(j.createdAt).getTime() >= todayStart
    ).length;
    const activeAutomations = data.automations.filter((a) => a.status === 'active').length;
    const errorsCount = data.message_jobs.filter((j) => j.status === 'failed' || (j.status as any) === 'error').length;

    // Shopee integration state
    const shopeeClient = new ShopeeAffiliateClient();
    const shopeeIntegration = data.integrations.find((i) => i.provider === 'shopee');
    const lastConversion = data.link_conversions[0]?.createdAt || null;

    // WhatsApp integration state
    const waIntegration = data.integrations.find((i) => i.provider === 'whatsapp');

    // Active automations list
    const activeAutomationsList = data.automations.map((a) => {
      const configGroup = data.configuration_groups.find((cg) => cg.id === a.configurationGroupId);
      const queue = data.automation_products.filter((ap) => ap.automationId === a.id);
      const currentIndex = a.currentProductIndex || 0;
      const currentQueueItem = queue[currentIndex] || null;
      const currentProduct = currentQueueItem
        ? data.products.find((p) => p.id === currentQueueItem.productId)
        : null;

      const progressPercent = queue.length > 0
        ? Math.min(100, Math.round((currentIndex / queue.length) * 100))
        : 0;

      return {
        id: a.id,
        name: a.name,
        groupName: configGroup?.name || 'Grupo não configurado',
        total: queue.length,
        current: currentIndex + 1,
        remaining: Math.max(0, queue.length - currentIndex),
        currentProductName: currentProduct?.productName || 'Aguardando',
        progressPercent,
        nextRunAt: a.nextRunAt,
        status: a.status,
      };
    });

    // Recent activity (last 10 jobs)
    const recentJobs = data.message_jobs.slice(0, 10).map((job) => {
      const auto = data.automations.find((a) => a.id === job.automationId);
      return {
        id: job.id,
        time: job.sentAt || job.createdAt,
        productName: job.productName,
        automationName: auto?.name || 'Manual',
        groupName: job.groupName,
        status: job.status,
        error: job.error,
      };
    });

    return NextResponse.json({
      success: true,
      stats: {
        availableProducts,
        waitingProducts,
        postedToday,
        activeAutomations,
        errorsCount,
      },
      integrations: {
        shopee: {
          connected: shopeeClient.isConfigured(),
          lastConversion,
          totalProducts: data.products.length,
        },
        whatsapp: {
          connected: waIntegration?.status === 'connected',
          phone: waIntegration?.credentials?.phone || null,
          totalGroups: data.whatsapp_groups.length,
          lastSync: waIntegration?.lastSync || null,
        },
      },
      activeAutomations: activeAutomationsList,
      recentActivity: recentJobs,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

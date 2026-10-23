import { Env, BatchQueueMessage } from '../types';
import { DatabaseService } from './db';
import { WorkerShopeeClient, parseShopeeUrl, convertLinkWithClient } from './shopee';

export async function handleQueueBatch(batch: MessageBatch<BatchQueueMessage>, env: Env): Promise<void> {
  const db = new DatabaseService(env.DB);
  const shopee = new WorkerShopeeClient(env);

  for (const message of batch.messages) {
    const { batchId, urls, subIds = [] } = message.body;

    let processedCount = 0;
    let convertedCount = 0;
    let errorCount = 0;

    for (const rawUrl of urls) {
      processedCount++;
      const parsed = parseShopeeUrl(rawUrl);

      if (!parsed) {
        errorCount++;
        await env.DB
          .prepare(
            `INSERT INTO link_conversions (id, batch_id, original_url, status, error)
             VALUES (?, ?, ?, 'error', 'URL inválida da Shopee')`
          )
          .bind(`conv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`, batchId, rawUrl)
          .run();
        continue;
      }

      try {
        const conversion = await convertLinkWithClient(shopee, parsed, subIds);

        if (conversion.success) {
          convertedCount++;

          // Upsert product in D1
          await db.upsertProduct({
            id: `prod-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            item_id: conversion.itemId || null,
            shop_id: conversion.shopId || null,
            product_name: conversion.productName,
            product_link: parsed.cleanUrl,
            affiliate_link: conversion.affiliateUrl,
            image_url: conversion.imageUrl || null,
            price_min: conversion.priceMin,
            price_max: conversion.priceMax || null,
            price_previous: conversion.pricePrevious || null,
            commission_rate: conversion.commissionRate || null,
            seller_commission_rate: conversion.sellerCommissionRate || null,
            shopee_commission_rate: conversion.shopeeCommissionRate || null,
            commission: conversion.commission || null,
            rating_star: conversion.ratingStar || null,
            sales: conversion.sales || null,
            shop_name: conversion.shopName || null,
            sub_ids: subIds.length > 0 ? JSON.stringify(subIds) : null,
          });

          // Record conversion
          await env.DB
            .prepare(
              `INSERT INTO link_conversions (id, batch_id, original_url, affiliate_url, product_name, status, sub_ids, item_id, shop_id)
               VALUES (?, ?, ?, ?, ?, 'converted', ?, ?, ?)`
            )
            .bind(
              `conv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              batchId,
              parsed.original,
              conversion.affiliateUrl,
              conversion.productName,
              subIds.length > 0 ? JSON.stringify(subIds) : null,
              conversion.itemId || null,
              conversion.shopId || null
            )
            .run();
        } else {
          errorCount++;
          await env.DB
            .prepare(
              `INSERT INTO link_conversions (id, batch_id, original_url, status, error)
               VALUES (?, ?, ?, 'error', ?)`
            )
            .bind(
              `conv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              batchId,
              parsed.original,
              conversion.error || 'Falha na conversão'
            )
            .run();
        }
      } catch (err: any) {
        errorCount++;
        await env.DB
          .prepare(
            `INSERT INTO link_conversions (id, batch_id, original_url, status, error)
             VALUES (?, ?, ?, 'error', ?)`
          )
          .bind(
            `conv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            batchId,
            parsed.original,
            err.message
          )
          .run();
      }
    }

    // Check if this batch is complete
    const batchRecord = await db.getBatchImport(batchId);
    const newTotalProcessed = (batchRecord?.processed_count || 0) + processedCount;
    const isDone = newTotalProcessed >= (batchRecord?.total_links || 0);

    await db.updateBatchProgress(batchId, processedCount, convertedCount, errorCount, isDone);
    message.ack();
  }
}

import { Hono } from 'hono';
import { Env, BatchQueueMessage } from '../types';
import { DatabaseService } from '../services/db';
import { WorkerShopeeClient, parseShopeeUrl, convertLinkWithClient } from '../services/shopee';

export const shopeeRoutes = new Hono<{ Bindings: Env }>();

// POST /api/shopee/convert (Synchronous conversion)
shopeeRoutes.post('/convert', async (c) => {
  try {
    const { urls, subIds = [] } = await c.req.json();

    if (!Array.isArray(urls) || urls.length === 0) {
      return c.json({ error: 'Nenhum link fornecido para conversão.' }, 400);
    }

    const cleanSubIds = Array.isArray(subIds)
      ? subIds.map((s) => String(s).trim()).filter(Boolean)
      : [];

    const db = new DatabaseService(c.env.DB);
    const shopee = new WorkerShopeeClient(c.env);

    const results: any[] = [];
    let convertedCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    // Check existing products for duplicate detection
    const { results: existingProducts } = await c.env.DB
      .prepare('SELECT product_link FROM products')
      .all<{ product_link: string }>();
    const existingLinks = new Set((existingProducts || []).map((p) => p.product_link));

    for (const rawUrl of urls) {
      const parsed = parseShopeeUrl(rawUrl);

      if (!parsed) {
        errorCount++;
        results.push({
          originalUrl: rawUrl,
          affiliateUrl: '',
          productName: 'Link inválido ou não reconhecido',
          priceMin: 0,
          status: 'error',
          error: 'URL não pertence a um domínio Shopee válido.',
          success: false,
        });
        continue;
      }

      const isDuplicate = existingLinks.has(parsed.cleanUrl);
      if (isDuplicate) duplicateCount++;

      try {
        const conversion = await convertLinkWithClient(shopee, parsed, cleanSubIds);

        if (conversion.success) {
          convertedCount++;
          const productId = `prod-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

          // Save product in D1
          await db.upsertProduct({
            id: productId,
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
            sub_ids: cleanSubIds.length > 0 ? JSON.stringify(cleanSubIds) : null,
          });

          // Log conversion in link_conversions table
          await c.env.DB
            .prepare(
              `INSERT INTO link_conversions (id, original_url, affiliate_url, product_name, status, sub_ids, item_id, shop_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              `conv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              parsed.original,
              conversion.affiliateUrl,
              conversion.productName,
              isDuplicate ? 'duplicate' : 'converted',
              cleanSubIds.length > 0 ? JSON.stringify(cleanSubIds) : null,
              conversion.itemId || null,
              conversion.shopId || null
            )
            .run();

          // Activity log
          await c.env.DB
            .prepare('INSERT INTO activity_logs (id, type, description) VALUES (?, "conversion", ?)')
            .bind(
              `log-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
              `Link convertido: ${conversion.productName}`
            )
            .run();

          results.push({
            originalUrl: parsed.original,
            affiliateUrl: conversion.affiliateUrl,
            productName: conversion.productName,
            imageUrl: conversion.imageUrl,
            priceMin: conversion.priceMin,
            pricePrevious: conversion.pricePrevious,
            subIds: cleanSubIds,
            status: isDuplicate ? 'duplicate' : 'converted',
            success: true,
          });
        } else {
          errorCount++;
          results.push({
            originalUrl: parsed.original,
            affiliateUrl: '',
            productName: 'Erro na conversão',
            priceMin: 0,
            status: 'error',
            error: conversion.error || 'Erro desconhecido na Shopee API',
            success: false,
          });
        }
      } catch (err: any) {
        errorCount++;
        results.push({
          originalUrl: parsed.original,
          affiliateUrl: '',
          productName: 'Erro no processamento',
          priceMin: 0,
          status: 'error',
          error: err.message,
          success: false,
        });
      }
    }

    return c.json({
      success: true,
      stats: {
        total: urls.length,
        converted: convertedCount,
        duplicates: duplicateCount,
        errors: errorCount,
        waiting: 0,
      },
      results,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/shopee/batch-import (Asynchronous Queued batch import)
shopeeRoutes.post('/batch-import', async (c) => {
  try {
    const { urls, subIds = [] } = await c.req.json();

    if (!Array.isArray(urls) || urls.length === 0) {
      return c.json({ error: 'Nenhum link fornecido.' }, 400);
    }

    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const db = new DatabaseService(c.env.DB);
    await db.createBatchImport(batchId, urls.length);

    // If Cloudflare Queues binding is available, enqueue in chunks of 20
    if (c.env.IMPORT_QUEUE) {
      const chunkSize = 20;
      for (let i = 0; i < urls.length; i += chunkSize) {
        const chunk = urls.slice(i, i + chunkSize);
        await c.env.IMPORT_QUEUE.send({
          batchId,
          urls: chunk,
          subIds,
          timestamp: new Date().toISOString(),
        });
      }
    } else {
      // Fallback if Queues binding not configured locally: process synchronously
      const shopee = new WorkerShopeeClient(c.env);
      let converted = 0;
      let errors = 0;

      for (const url of urls) {
        const parsed = parseShopeeUrl(url);
        if (!parsed) {
          errors++;
          continue;
        }
        try {
          const conv = await convertLinkWithClient(shopee, parsed, subIds);
          if (conv.success) {
            converted++;
            await db.upsertProduct({
              id: `prod-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              product_name: conv.productName,
              product_link: parsed.cleanUrl,
              affiliate_link: conv.affiliateUrl,
              image_url: conv.imageUrl || null,
              price_min: conv.priceMin,
              price_previous: conv.pricePrevious || null,
              sub_ids: subIds.length > 0 ? JSON.stringify(subIds) : null,
            });
          } else {
            errors++;
          }
        } catch {
          errors++;
        }
      }

      await db.updateBatchProgress(batchId, urls.length, converted, errors, true);
    }

    return c.json({
      success: true,
      batchId,
      total: urls.length,
      status: 'pending',
      message: 'Lote enviado para processamento em segundo plano.',
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/shopee/batch-import/:batchId (Check batch status)
shopeeRoutes.get('/batch-import/:batchId', async (c) => {
  const batchId = c.req.param('batchId');
  const db = new DatabaseService(c.env.DB);
  const record = await db.getBatchImport(batchId);

  if (!record) {
    return c.json({ error: 'Lote de importação não encontrado' }, 404);
  }

  return c.json({ success: true, batch: record });
});

// POST /api/shopee/test (Test Shopee API Credentials)
shopeeRoutes.post('/test', async (c) => {
  try {
    const shopee = new WorkerShopeeClient(c.env);
    // Test with Shopee home
    const testShortLink = await shopee.generateShortLink('https://shopee.com.br');
    return c.json({
      success: true,
      message: 'Conexão com a Shopee Affiliate API realizada com sucesso!',
      sampleShortLink: testShortLink,
    });
  } catch (err: any) {
    return c.json({
      success: false,
      error: `Falha ao conectar com Shopee: ${err.message}`,
    }, 400);
  }
});

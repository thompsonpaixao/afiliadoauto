import { Hono } from 'hono';
import { Env, ProductRow } from '../types';
import { DatabaseService } from '../services/db';
import { WorkerShopeeClient, parseShopeeUrl, convertLinkWithClient } from '../services/shopee';

export const productRoutes = new Hono<{ Bindings: Env }>();

export function mapProductToCamel(row: ProductRow) {
  let subIdsArray: string[] | null = null;
  if (row.sub_ids) {
    try {
      subIdsArray = JSON.parse(row.sub_ids);
    } catch {
      subIdsArray = [row.sub_ids];
    }
  }

  return {
    id: row.id,
    itemId: row.item_id,
    shopId: row.shop_id,
    productName: row.product_name,
    productLink: row.product_link,
    offerLink: row.offer_link,
    affiliateLink: row.affiliate_link,
    imageUrl: row.image_url,
    priceMin: row.price_min,
    priceMax: row.price_max,
    pricePrevious: row.price_previous,
    commissionRate: row.commission_rate,
    sellerCommissionRate: row.seller_commission_rate,
    shopeeCommissionRate: row.shopee_commission_rate,
    commission: row.commission,
    ratingStar: row.rating_star,
    priceDiscountRate: row.price_discount_rate,
    sales: row.sales,
    shopName: row.shop_name,
    couponCode: row.coupon_code,
    couponDescription: row.coupon_description,
    couponValue: row.coupon_value,
    couponExpiration: row.coupon_expiration,
    subIds: subIdsArray,
    status: row.status,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // snake_case aliases for universal compatibility
    product_name: row.product_name,
    affiliate_link: row.affiliate_link,
    image_url: row.image_url,
    price_min: row.price_min,
    price_previous: row.price_previous,
  };
}

// GET /api/products
productRoutes.get('/', async (c) => {
  try {
    const status = c.req.query('status') || 'all';
    const search = c.req.query('search') || '';

    const db = new DatabaseService(c.env.DB);
    const { counts, products } = await db.getProducts(status, search);

    return c.json({
      success: true,
      counts,
      products: products.map(mapProductToCamel),
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /api/products
productRoutes.delete('/', async (c) => {
  try {
    const { ids } = await c.req.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return c.json({ error: 'Nenhum ID fornecido para exclusão.' }, 400);
    }

    const db = new DatabaseService(c.env.DB);
    await db.deleteProducts(ids);

    // Also remove from automation queues
    const placeholders = ids.map(() => '?').join(',');
    await c.env.DB.prepare(`DELETE FROM automation_products WHERE product_id IN (${placeholders})`).bind(...ids).run();

    await c.env.DB
      .prepare('INSERT INTO activity_logs (id, type, description) VALUES (?, "system", ?)')
      .bind(`log-${Date.now()}`, `${ids.length} produto(s) excluído(s) da biblioteca.`)
      .run();

    return c.json({ success: true, deletedCount: ids.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/products (Reconvert action)
productRoutes.post('/', async (c) => {
  try {
    const { action, productId, subIds } = await c.req.json();

    if (action === 'reconvert' && productId) {
      const product = await c.env.DB
        .prepare('SELECT * FROM products WHERE id = ?')
        .bind(productId)
        .first<ProductRow>();

      if (!product) {
        return c.json({ error: 'Produto não encontrado' }, 404);
      }

      const parsed = parseShopeeUrl(product.product_link);
      if (!parsed) {
        return c.json({ error: 'URL do produto inválida' }, 400);
      }

      const cleanSubIds = subIds || (product.sub_ids ? JSON.parse(product.sub_ids) : []);
      const shopee = new WorkerShopeeClient(c.env);
      const conversion = await convertLinkWithClient(shopee, parsed, cleanSubIds);

      if (!conversion.success) {
        return c.json({ error: conversion.error || 'Falha ao reconverter' }, 400);
      }

      const db = new DatabaseService(c.env.DB);
      await db.upsertProduct({
        id: product.id,
        product_name: conversion.productName,
        affiliate_link: conversion.affiliateUrl,
        image_url: conversion.imageUrl || product.image_url,
        price_min: conversion.priceMin,
        price_previous: conversion.pricePrevious,
        sub_ids: cleanSubIds.length > 0 ? JSON.stringify(cleanSubIds) : null,
      });

      return c.json({ success: true, conversion });
    }

    return c.json({ error: 'Ação não suportada' }, 400);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

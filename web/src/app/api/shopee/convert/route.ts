import { NextRequest, NextResponse } from 'next/server';
import { db, Product } from '@/lib/db';
import { parseShopeeUrl, convertShopeeLink, ShopeeAffiliateClient } from '@/lib/shopee';

export async function GET() {
  try {
    const data = db.read();
    const rawConversions = data.link_conversions || [];

    // Enrich conversions with image, price and details from saved products in the library
    const conversions = rawConversions.map((c) => {
      const matchedProd = data.products.find(
        (p) =>
          (c.itemId && p.itemId && p.itemId === c.itemId) ||
          p.originalUrl === c.originalUrl ||
          (c.affiliateUrl && p.affiliateLink === c.affiliateUrl) ||
          (p.productName && c.productName && p.productName.toLowerCase().trim() === c.productName.toLowerCase().trim())
      );

      return {
        ...c,
        imageUrl: matchedProd?.imageUrl || c.imageUrl || null,
        priceMin: typeof matchedProd?.currentPrice === 'number'
          ? matchedProd.currentPrice
          : (matchedProd?.priceMin ?? c.priceMin ?? 0),
        originalPrice: matchedProd?.originalPrice || matchedProd?.pricePrevious || null,
        pricePrevious: matchedProd?.pricePrevious || null,
        productId: matchedProd?.id || null,
        productName: matchedProd?.productName || c.productName || 'Produto Shopee',
      };
    });

    const stats = {
      total: conversions.length,
      converted: conversions.filter((c) => c.status === 'converted').length,
      duplicates: conversions.filter((c) => c.status === 'duplicate').length,
      errors: conversions.filter((c) => c.status === 'error').length,
      waiting: conversions.filter((c) => c.status === 'waiting').length,
    };
    return NextResponse.json({ success: true, conversions, stats });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { urls, items, subIds = [] } = body;

    let targetItems: Array<{
      offerLink?: string;
      productLink?: string;
      itemId?: string;
      itemName?: string;
      price?: number;
      sales?: number;
      shopName?: string;
      commissionRate?: number;
      commission?: number;
      rawUrl: string;
    }> = [];

    if (Array.isArray(items) && items.length > 0) {
      targetItems = items
        .map((i: any) => ({
          offerLink: i.offerLink,
          productLink: i.productLink,
          itemId: i.itemId,
          itemName: i.itemName,
          price: i.price,
          sales: i.sales,
          shopName: i.shopName,
          commissionRate: i.commissionRate,
          commission: i.commission,
          rawUrl: i.rawUrl || i.productLink || i.offerLink || '',
        }))
        .filter((i: any) => i.rawUrl || i.offerLink || i.productLink);
    } else if (Array.isArray(urls) && urls.length > 0) {
      targetItems = urls
        .map((u: string) => ({
          rawUrl: String(u).trim(),
        }))
        .filter((i: any) => i.rawUrl);
    }

    if (targetItems.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum link ou produto fornecido para conversão.' },
        { status: 400 }
      );
    }

    const cleanSubIds = Array.isArray(subIds)
      ? subIds.map((s) => String(s).trim().replace(/[^a-zA-Z0-9]/g, '')).filter(Boolean).slice(0, 5)
      : [];

    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const results = [];
    let convertedCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    for (const item of targetItems) {
      const originalUrl = item.rawUrl || item.productLink || item.offerLink || '';
      
      // Check if Sub IDs are OFF and we have a valid offerLink
      const canUseOfferLinkDirectly =
        cleanSubIds.length === 0 &&
        Boolean(item.offerLink && (item.offerLink.includes('shopee') || item.offerLink.includes('shp.ee')));

      if (canUseOfferLinkDirectly) {
        // Direct offerLink path without reconverting
        const finalAffiliateUrl = item.offerLink!.trim();
        const primaryLink = item.productLink || item.rawUrl || item.offerLink!;
        const parsed = parseShopeeUrl(primaryLink);

        try {
          const now = new Date().toISOString();
          let savedProductId = '';

          // Enrich details if product name or price is missing
          let resolvedName = item.itemName || '';
          let resolvedPrice = item.price ?? 0;
          let resolvedImage: string | null = null;
          let resolvedOriginalPrice: number | null = null;
          let resolvedItemId = item.itemId || parsed?.itemId || null;
          let resolvedShopId = parsed?.shopId || null;

          if ((!resolvedName || resolvedPrice === 0) && parsed) {
            try {
              const enriched = await convertShopeeLink(parsed, []);
              if (enriched.productName && enriched.productName !== 'Oferta Shopee') {
                resolvedName = resolvedName || enriched.productName;
              }
              if (enriched.priceMin > 0) {
                resolvedPrice = resolvedPrice || enriched.priceMin;
              }
              resolvedImage = enriched.imageUrl || null;
              resolvedOriginalPrice = enriched.originalPrice || null;
              resolvedItemId = resolvedItemId || enriched.itemId || null;
              resolvedShopId = resolvedShopId || enriched.shopId || null;
            } catch {}
          }

          if (!resolvedName) resolvedName = 'Produto Shopee';

          convertedCount++;

          db.update((d) => {
            const existingIdx = d.products.findIndex(
              (p) =>
                (resolvedItemId && p.itemId && p.itemId === resolvedItemId && (!resolvedShopId || p.shopId === resolvedShopId)) ||
                (parsed?.cleanUrl && p.productLink === parsed.cleanUrl) ||
                p.originalUrl === originalUrl ||
                (p.affiliateLink && p.affiliateLink === finalAffiliateUrl)
            );

            const isDuplicate = existingIdx >= 0;
            if (isDuplicate) {
              duplicateCount++;
              savedProductId = d.products[existingIdx].id;
              d.products[existingIdx] = {
                ...d.products[existingIdx],
                productName: resolvedName || d.products[existingIdx].productName,
                imageUrl: resolvedImage || d.products[existingIdx].imageUrl,
                priceMin: resolvedPrice > 0 ? resolvedPrice : d.products[existingIdx].priceMin,
                currentPrice: resolvedPrice > 0 ? resolvedPrice : d.products[existingIdx].currentPrice,
                originalPrice: resolvedOriginalPrice || d.products[existingIdx].originalPrice || null,
                pricePrevious: resolvedOriginalPrice || d.products[existingIdx].pricePrevious || null,
                priceSource: 'shopee_csv_direct',
                priceUpdatedAt: now,
                affiliateLink: finalAffiliateUrl,
                sales: item.sales ?? d.products[existingIdx].sales,
                shopName: item.shopName || d.products[existingIdx].shopName,
                commissionRate: item.commissionRate ?? d.products[existingIdx].commissionRate,
                commission: item.commission ?? d.products[existingIdx].commission,
                status: 'available',
                updatedAt: now,
              };
            } else {
              savedProductId = `prod-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
              const newProduct: Product = {
                id: savedProductId,
                itemId: resolvedItemId,
                shopId: resolvedShopId,
                productName: resolvedName,
                productLink: parsed?.cleanUrl || primaryLink,
                affiliateLink: finalAffiliateUrl,
                imageUrl: resolvedImage,
                priceMin: resolvedPrice,
                currentPrice: resolvedPrice,
                originalPrice: resolvedOriginalPrice,
                pricePrevious: resolvedOriginalPrice,
                discountPercent: null,
                priceSource: 'shopee_csv_direct',
                priceUpdatedAt: now,
                source: 'shopee',
                createdBy: 'import_file',
                sourceBatchId: batchId,
                originalUrl,
                commissionRate: item.commissionRate ?? null,
                commission: item.commission ?? null,
                sales: item.sales ?? null,
                shopName: item.shopName ?? null,
                subIds: null,
                status: 'available',
                createdAt: now,
                updatedAt: now,
              };
              d.products.unshift(newProduct);
            }

            // Link conversion history
            const existingConvIdx = d.link_conversions.findIndex(
              (c) => c.originalUrl === originalUrl && c.affiliateUrl === finalAffiliateUrl
            );

            if (existingConvIdx >= 0) {
              d.link_conversions[existingConvIdx].createdAt = now;
              d.link_conversions[existingConvIdx].batchId = batchId;
              d.link_conversions[existingConvIdx].imageUrl = resolvedImage || d.link_conversions[existingConvIdx].imageUrl;
              d.link_conversions[existingConvIdx].priceMin = resolvedPrice || d.link_conversions[existingConvIdx].priceMin;
              d.link_conversions[existingConvIdx].status = isDuplicate ? 'duplicate' : 'converted';
            } else {
              d.link_conversions.unshift({
                id: `conv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                batchId,
                sourceBatchId: batchId,
                originalUrl,
                affiliateUrl: finalAffiliateUrl,
                productName: resolvedName,
                imageUrl: resolvedImage || null,
                priceMin: resolvedPrice || null,
                status: isDuplicate ? 'duplicate' : 'converted',
                reason: targetItems.length > 1 ? 'batch_import' : 'manual_import',
                subIds: null,
                itemId: resolvedItemId,
                shopId: resolvedShopId,
                createdAt: now,
              });
            }

            d.activity_logs.unshift({
              id: `log-${Date.now()}`,
              type: 'conversion',
              description: `Link importado diretamente: ${resolvedName}`,
              createdAt: now,
            });
          });

          results.push({
            id: savedProductId,
            batchId,
            originalUrl,
            affiliateUrl: finalAffiliateUrl,
            productName: resolvedName,
            imageUrl: resolvedImage,
            priceMin: resolvedPrice,
            currentPrice: resolvedPrice,
            originalPrice: resolvedOriginalPrice,
            pricePrevious: resolvedOriginalPrice,
            subIds: null,
            status: 'converted',
            success: true,
          });
        } catch (err: any) {
          errorCount++;
          results.push({
            originalUrl,
            affiliateUrl: '',
            productName: item.itemName || 'Erro ao importar',
            priceMin: 0,
            status: 'error',
            error: err.message,
            success: false,
          });
        }
      } else {
        // Standard or Sub ID regeneration path
        const targetUrl = item.productLink || item.rawUrl || item.offerLink || '';
        const parsed = parseShopeeUrl(targetUrl);

        if (!parsed) {
          errorCount++;
          results.push({
            originalUrl,
            affiliateUrl: '',
            productName: item.itemName || 'Link inválido ou não reconhecido',
            priceMin: 0,
            status: 'error',
            error: 'URL não pertence a um domínio Shopee válido.',
            success: false,
          });
          continue;
        }

        try {
          const conversion = await convertShopeeLink(parsed, cleanSubIds);

          if (conversion.success) {
            convertedCount++;
            const now = new Date().toISOString();
            let savedProductId = '';

            const finalName = (conversion.productName && conversion.productName !== 'Oferta Shopee')
              ? conversion.productName
              : (item.itemName || conversion.productName || 'Produto Shopee');

            const finalPrice = conversion.priceMin > 0 ? conversion.priceMin : (item.price ?? 0);

            db.update((d) => {
              const existingIdx = d.products.findIndex(
                (p) =>
                  (conversion.itemId && p.itemId && p.itemId === conversion.itemId && (!conversion.shopId || p.shopId === conversion.shopId)) ||
                  p.productLink === parsed.cleanUrl ||
                  p.originalUrl === parsed.original ||
                  (p.affiliateLink && p.affiliateLink === conversion.affiliateUrl)
              );

              const isDuplicate = existingIdx >= 0;
              if (isDuplicate) {
                duplicateCount++;
                savedProductId = d.products[existingIdx].id;
                d.products[existingIdx] = {
                  ...d.products[existingIdx],
                  productName: finalName,
                  imageUrl: conversion.imageUrl || d.products[existingIdx].imageUrl,
                  priceMin: finalPrice,
                  currentPrice: finalPrice,
                  originalPrice: conversion.originalPrice || d.products[existingIdx].originalPrice || null,
                  pricePrevious: conversion.originalPrice || d.products[existingIdx].pricePrevious || null,
                  discountPercent: conversion.priceDiscountRate ?? d.products[existingIdx].discountPercent,
                  priceSource: 'shopee_api',
                  priceUpdatedAt: now,
                  affiliateLink: conversion.affiliateUrl,
                  subIds: cleanSubIds.length > 0 ? cleanSubIds : d.products[existingIdx].subIds,
                  status: 'available',
                  updatedAt: now,
                };
              } else {
                savedProductId = `prod-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
                const newProduct: Product = {
                  id: savedProductId,
                  itemId: conversion.itemId,
                  shopId: conversion.shopId,
                  productName: finalName,
                  productLink: parsed.cleanUrl,
                  affiliateLink: conversion.affiliateUrl,
                  imageUrl: conversion.imageUrl,
                  priceMin: finalPrice,
                  priceMax: conversion.priceMax,
                  pricePrevious: conversion.originalPrice || null,
                  currentPrice: finalPrice,
                  originalPrice: conversion.originalPrice || null,
                  discountPercent: conversion.priceDiscountRate || null,
                  priceSource: 'shopee_api',
                  priceUpdatedAt: now,
                  source: 'shopee',
                  createdBy: 'import_shopee',
                  sourceBatchId: batchId,
                  originalUrl: parsed.original,
                  commissionRate: conversion.commissionRate ?? item.commissionRate ?? null,
                  sellerCommissionRate: conversion.sellerCommissionRate ?? null,
                  shopeeCommissionRate: conversion.shopeeCommissionRate ?? null,
                  commission: conversion.commission ?? item.commission ?? null,
                  ratingStar: conversion.ratingStar ?? null,
                  priceDiscountRate: conversion.priceDiscountRate ?? null,
                  sales: conversion.sales ?? item.sales ?? null,
                  shopName: conversion.shopName ?? item.shopName ?? null,
                  couponCode: conversion.couponCode ?? null,
                  couponDescription: conversion.couponDescription ?? null,
                  couponValue: conversion.couponValue ?? null,
                  couponExpiration: conversion.couponExpiration ?? null,
                  subIds: cleanSubIds.length > 0 ? cleanSubIds : null,
                  status: 'available',
                  createdAt: now,
                  updatedAt: now,
                };
                d.products.unshift(newProduct);
              }

              const existingConvIdx = d.link_conversions.findIndex(
                (c) => c.originalUrl === parsed.original && JSON.stringify(c.subIds || []) === JSON.stringify(cleanSubIds)
              );

              if (existingConvIdx >= 0) {
                d.link_conversions[existingConvIdx].createdAt = now;
                d.link_conversions[existingConvIdx].batchId = batchId;
                d.link_conversions[existingConvIdx].affiliateUrl = conversion.affiliateUrl;
                d.link_conversions[existingConvIdx].productName = finalName;
                d.link_conversions[existingConvIdx].imageUrl = conversion.imageUrl || d.link_conversions[existingConvIdx].imageUrl;
                d.link_conversions[existingConvIdx].priceMin = finalPrice || d.link_conversions[existingConvIdx].priceMin;
                d.link_conversions[existingConvIdx].status = isDuplicate ? 'duplicate' : 'converted';
              } else {
                d.link_conversions.unshift({
                  id: `conv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                  batchId,
                  sourceBatchId: batchId,
                  originalUrl: parsed.original,
                  affiliateUrl: conversion.affiliateUrl,
                  productName: finalName,
                  imageUrl: conversion.imageUrl || null,
                  priceMin: finalPrice || null,
                  status: isDuplicate ? 'duplicate' : 'converted',
                  reason: targetItems.length > 1 ? 'batch_import' : 'manual_import',
                  subIds: cleanSubIds,
                  itemId: conversion.itemId,
                  shopId: conversion.shopId,
                  createdAt: now,
                });
              }

              d.activity_logs.unshift({
                id: `log-${Date.now()}`,
                type: 'conversion',
                description: `Link convertido: ${finalName}`,
                createdAt: now,
              });
            });

            results.push({
              id: savedProductId,
              batchId,
              originalUrl: parsed.original,
              affiliateUrl: conversion.affiliateUrl,
              productName: finalName,
              imageUrl: conversion.imageUrl,
              priceMin: finalPrice,
              currentPrice: finalPrice,
              originalPrice: conversion.originalPrice || null,
              pricePrevious: conversion.originalPrice || null,
              subIds: cleanSubIds,
              status: 'converted',
              success: true,
            });
          } else {
            errorCount++;
            const errDetail = conversion.error || 'Erro desconhecido na Shopee API';
            results.push({
              originalUrl: parsed.original,
              affiliateUrl: '',
              productName: item.itemName || 'Erro na conversão',
              priceMin: 0,
              status: 'error',
              error: errDetail,
              success: false,
            });
          }
        } catch (err: any) {
          errorCount++;
          results.push({
            originalUrl: parsed.original,
            affiliateUrl: '',
            productName: item.itemName || 'Erro no processamento',
            priceMin: 0,
            status: 'error',
            error: err.message,
            success: false,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      batchId,
      stats: {
        total: targetItems.length,
        converted: convertedCount,
        duplicates: duplicateCount,
        errors: errorCount,
      },
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id, batchId, ids, all } = await req.json();

    db.update((d) => {
      if (all) {
        d.link_conversions = [];
      } else if (Array.isArray(ids) && ids.length > 0) {
        d.link_conversions = d.link_conversions.filter((c) => !ids.includes(c.id));
      } else if (batchId) {
        d.link_conversions = d.link_conversions.filter((c) => c.batchId !== batchId && c.sourceBatchId !== batchId);
      } else if (id) {
        d.link_conversions = d.link_conversions.filter((c) => c.id !== id);
      }
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

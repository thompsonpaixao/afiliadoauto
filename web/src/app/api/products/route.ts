import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parseShopeeUrl, convertShopeeLink } from '@/lib/shopee';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get('search') || '').toLowerCase().trim();
    const status = searchParams.get('status') || 'all';
    const automationId = searchParams.get('automationId');

    const data = db.read();
    let allProducts = data.products;
    let automationName: string | null = null;

    if (automationId) {
      const auto = data.automations.find((a) => a.id === automationId);
      if (auto) {
        automationName = auto.name;
        const autoProductIds = new Set(
          data.automation_products
            .filter((ap) => ap.automationId === automationId)
            .map((ap) => ap.productId)
        );
        allProducts = allProducts.filter((p) => autoProductIds.has(p.id));
      }
    }

    // Real tab counts
    const counts = {
      all: allProducts.length,
      available: allProducts.filter((p) => p.status === 'available').length,
      waiting: allProducts.filter((p) => p.status === 'waiting').length,
      posted: allProducts.filter((p) => p.status === 'posted').length,
      error: allProducts.filter((p) => p.status === 'error').length,
    };

    let filtered = allProducts;

    // Filter by tab status
    if (status !== 'all') {
      filtered = filtered.filter((p) => p.status === status);
    }

    // Filter by search query
    if (search) {
      filtered = filtered.filter(
        (p) =>
          p.productName.toLowerCase().includes(search) ||
          p.productLink.toLowerCase().includes(search) ||
          p.affiliateLink.toLowerCase().includes(search) ||
          (p.subIds && p.subIds.some((s) => s.toLowerCase().includes(search))) ||
          (p.shopName && p.shopName.toLowerCase().includes(search))
      );
    }

    return NextResponse.json({
      success: true,
      counts,
      products: filtered,
      automationName,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { ids, all } = body;

    if (all) {
      db.update((d) => {
        const count = d.products.length;
        d.products = [];
        d.automation_products = [];
        d.activity_logs.unshift({
          id: `log-${Date.now()}`,
          type: 'system',
          description: `Todos os produtos (${count}) foram excluídos da biblioteca.`,
          createdAt: new Date().toISOString(),
        });
      });
      return NextResponse.json({ success: true, deletedCount: 'all' });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Nenhum ID fornecido para exclusão.' }, { status: 400 });
    }

    const idsSet = new Set(ids);

    db.update((d) => {
      d.products = d.products.filter((p) => !idsSet.has(p.id));
      d.automation_products = d.automation_products.filter((ap) => !idsSet.has(ap.productId));
      d.activity_logs.unshift({
        id: `log-${Date.now()}`,
        type: 'system',
        description: `${ids.length} produto(s) excluído(s) da biblioteca.`,
        createdAt: new Date().toISOString(),
      });
    });

    return NextResponse.json({ success: true, deletedCount: ids.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, productId, subIds } = body;

    // 1. Reconvert Shopee link
    if (action === 'reconvert' && productId) {
      const data = db.read();
      const product = data.products.find((p) => p.id === productId);

      if (!product) {
        return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
      }

      const parsed = parseShopeeUrl(product.productLink);
      if (!parsed) {
        return NextResponse.json({ error: 'URL do produto inválida' }, { status: 400 });
      }

      const conversion = await convertShopeeLink(parsed, subIds || product.subIds || []);
      if (!conversion.success) {
        return NextResponse.json({ error: conversion.error || 'Falha ao reconverter' }, { status: 400 });
      }

      const now = new Date().toISOString();
      db.update((d) => {
        const p = d.products.find((prod) => prod.id === productId);
        if (p) {
          p.affiliateLink = conversion.affiliateUrl;
          p.productName = conversion.productName;
          p.priceMin = conversion.priceMin;
          p.currentPrice = conversion.priceMin;
          p.pricePrevious = conversion.originalPrice || null;
          p.originalPrice = conversion.originalPrice || null;
          p.imageUrl = conversion.imageUrl || p.imageUrl;
          p.subIds = conversion.subIds;
          p.status = 'available';
          p.lastError = null;
          p.updatedAt = now;
        }
      });

      return NextResponse.json({ success: true, conversion });
    }

    // 2. Create manual product (Non-Shopee or custom affiliate link)
    if (action === 'create_manual') {
      const {
        productName,
        productLink,
        affiliateLink,
        imageUrl,
        priceMin = 0,
        pricePrevious,
        couponCode,
        description,
        source = 'manual',
      } = body;

      if (!productName || !productName.trim()) {
        return NextResponse.json({ error: 'Nome do produto é obrigatório.' }, { status: 400 });
      }
      if (!affiliateLink && !productLink) {
        return NextResponse.json({ error: 'Informe ao menos o link do produto ou de afiliado.' }, { status: 400 });
      }

      const now = new Date().toISOString();
      const curPrice = Number(priceMin) || 0;
      const origPrice = pricePrevious ? Number(pricePrevious) : null;
      const discount = origPrice && origPrice > curPrice
        ? Math.round(((origPrice - curPrice) / origPrice) * 100)
        : null;

      const newProduct = {
        id: `prod-manual-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        productName: productName.trim(),
        productLink: (productLink || affiliateLink).trim(),
        affiliateLink: (affiliateLink || productLink).trim(),
        imageUrl: imageUrl ? imageUrl.trim() : null,
        priceMin: curPrice,
        pricePrevious: origPrice,
        currentPrice: curPrice,
        originalPrice: origPrice,
        discountPercent: discount,
        priceSource: 'manual',
        priceUpdatedAt: now,
        couponCode: couponCode ? couponCode.trim() : null,
        shopName: source === 'manual' ? 'Manual' : source,
        source: (source || 'manual') as any,
        createdBy: 'user',
        sourceBatchId: null,
        originalUrl: (productLink || affiliateLink).trim(),
        description: description ? description.trim() : null,
        status: 'available' as const,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      };

      db.update((d) => {
        d.products.unshift(newProduct);
        d.activity_logs.unshift({
          id: `log-${Date.now()}`,
          type: 'system',
          description: `Produto manual cadastrado: ${newProduct.productName}`,
          createdAt: now,
        });
      });

      return NextResponse.json({ success: true, product: newProduct });
    }

    // 3. Edit existing product
    if (action === 'edit' && productId) {
      const {
        productName,
        affiliateLink,
        productLink,
        imageUrl,
        priceMin,
        currentPrice,
        pricePrevious,
        originalPrice,
        couponCode,
        description,
        status,
      } = body;

      const now = new Date().toISOString();
      let updatedProduct: any = null;

      db.update((d) => {
        const p = d.products.find((prod) => prod.id === productId);
        if (p) {
          if (productName !== undefined) p.productName = productName.trim();
          if (affiliateLink !== undefined) p.affiliateLink = affiliateLink.trim();
          if (productLink !== undefined) p.productLink = productLink.trim();
          if (imageUrl !== undefined) p.imageUrl = imageUrl ? imageUrl.trim() : null;
          
          if (currentPrice !== undefined || priceMin !== undefined) {
            const cur = currentPrice !== undefined ? currentPrice : priceMin;
            p.currentPrice = Number(cur) || 0;
            p.priceMin = p.currentPrice;
          }

          if (originalPrice !== undefined || pricePrevious !== undefined) {
            const orig = originalPrice !== undefined ? originalPrice : pricePrevious;
            p.originalPrice = orig ? Number(orig) : null;
            p.pricePrevious = p.originalPrice;
          }

          if (couponCode !== undefined) {
            p.couponCode = couponCode ? couponCode.trim() : null;
          }

          if (description !== undefined) p.description = description ? description.trim() : null;
          if (status !== undefined) {
            p.status = status;
            if (status !== 'error') p.lastError = null;
          }
          p.updatedAt = now;
          updatedProduct = { ...p };
        }
      });

      if (!updatedProduct) {
        return NextResponse.json({ error: 'Produto não encontrado.' }, { status: 404 });
      }

      return NextResponse.json({ success: true, product: updatedProduct });
    }

    // 4. Convert errored item to manual product
    if (action === 'convert_to_manual' && productId) {
      const { productName, priceMin, imageUrl, affiliateLink } = body;
      const now = new Date().toISOString();
      let updatedProduct: any = null;

      db.update((d) => {
        const p = d.products.find((prod) => prod.id === productId);
        if (p) {
          if (productName) p.productName = productName;
          if (priceMin !== undefined) p.priceMin = Number(priceMin) || 0;
          if (imageUrl) p.imageUrl = imageUrl;
          if (affiliateLink) p.affiliateLink = affiliateLink;
          p.source = 'manual';
          p.shopName = 'Manual';
          p.status = 'available';
          p.lastError = null;
          p.updatedAt = now;
          updatedProduct = { ...p };
        }
      });

      if (!updatedProduct) {
        return NextResponse.json({ error: 'Produto não encontrado.' }, { status: 404 });
      }

      return NextResponse.json({ success: true, product: updatedProduct });
    }

    return NextResponse.json({ error: 'Ação não suportada' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

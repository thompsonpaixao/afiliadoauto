import { Env } from '../types';

export interface ParsedShopeeUrl {
  original: string;
  cleanUrl: string;
  isShortLink: boolean;
  shopId?: string | null;
  itemId?: string | null;
}

export interface ShopeeConvertResult {
  originalUrl: string;
  affiliateUrl: string;
  productName: string;
  imageUrl?: string | null;
  priceMin: number;
  priceMax?: number | null;
  pricePrevious?: number | null;
  commissionRate?: number | null;
  sellerCommissionRate?: number | null;
  shopeeCommissionRate?: number | null;
  commission?: number | null;
  ratingStar?: number | null;
  priceDiscountRate?: number | null;
  sales?: number | null;
  shopName?: string | null;
  couponCode?: string | null;
  subIds?: string[] | null;
  itemId?: string | null;
  shopId?: string | null;
  success: boolean;
  error?: string | null;
}

export class WorkerShopeeClient {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  private isConfigured(): boolean {
    return Boolean(this.env.SHOPEE_APP_ID && this.env.SHOPEE_APP_SECRET);
  }

  private async generateAuthHeader(payload: string): Promise<{ authorization: string; timestamp: number }> {
    const timestamp = Math.floor(Date.now() / 1000);
    const appId = this.env.SHOPEE_APP_ID || '';
    const appSecret = this.env.SHOPEE_APP_SECRET || '';

    const factor = `${appId}${timestamp}${payload}${appSecret}`;
    const enc = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(factor));
    const signature = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return {
      authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`,
      timestamp,
    };
  }

  public async executeGraphQL<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error('Credenciais da Shopee Affiliate API (App ID e App Secret) não configuradas nos secrets do Worker.');
    }

    const endpoint = this.env.SHOPEE_ENDPOINT || 'https://open-api.affiliate.shopee.com.br/graphql';
    const payload = JSON.stringify({ query, variables });
    const { authorization } = await this.generateAuthHeader(payload);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
      },
      body: payload,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Shopee API HTTP ${response.status}: ${err}`);
    }

    const data: any = await response.json();
    if (data.errors && data.errors.length > 0) {
      throw new Error(data.errors.map((e: any) => e.message || 'Erro GraphQL').join(', '));
    }

    return data.data;
  }

  public async generateShortLink(originUrl: string, subIds: string[] = []): Promise<string> {
    const cleanSubIds = subIds.filter(Boolean);
    const mutation = `
      mutation generateShortLink($input: ShortLinkInput!) {
        generateShortLink(input: $input) {
          shortLink
        }
      }
    `;

    const variables = {
      input: {
        originUrl,
        ...(cleanSubIds.length > 0 ? { subIds: cleanSubIds } : {}),
      },
    };

    const data = await this.executeGraphQL(mutation, variables);
    const shortLink = data?.generateShortLink?.shortLink;
    if (!shortLink) throw new Error('Shopee API não retornou shortLink');
    return shortLink;
  }

  public async getProductDetails(itemId: string, shopId?: string): Promise<any> {
    const query = `
      query productOfferV2($itemId: Long, $shopId: Long) {
        productOfferV2(itemId: $itemId, shopId: $shopId) {
          nodes {
            itemId
            shopId
            productName
            imageUrl
            priceMin
            priceMax
            priceDiscountRate
            ratingStar
            sales
            shopName
            commissionRate
            sellerCommissionRate
            shopeeCommissionRate
            commission
            productLink
            offerLink
            periodStartTime
            periodEndTime
          }
        }
      }
    `;

    const variables = {
      itemId: Number(itemId),
      ...(shopId ? { shopId: Number(shopId) } : {}),
    };

    const data = await this.executeGraphQL(query, variables);
    return data?.productOfferV2?.nodes?.[0] || null;
  }
}

export function parseShopeeUrl(rawUrl: string): ParsedShopeeUrl | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  const trimmed = rawUrl.trim();
  const shopeeDomainRegex = /(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)?(shopee\.com\.br|shope\.ee|s\.shopee\.com\.br|shp\.ee|collshp\.com)\/[^\s<>"'{}|\\^`]+/i;
  const match = trimmed.match(shopeeDomainRegex);
  if (!match) return null;

  let fullUrl = match[0];
  if (!fullUrl.startsWith('http')) fullUrl = `https://${fullUrl}`;

  try {
    const parsed = new URL(fullUrl);
    const isShortLink = /s\.shopee\.com\.br|shope\.ee|shp\.ee/i.test(parsed.hostname);

    let shopId: string | null = null;
    let itemId: string | null = null;

    const pattern1 = /-i\.(\d+)\.(\d+)/;
    const match1 = parsed.pathname.match(pattern1);
    if (match1) {
      shopId = match1[1];
      itemId = match1[2];
    } else {
      const pattern2 = /\/product\/(\d+)\/(\d+)/;
      const match2 = parsed.pathname.match(pattern2);
      if (match2) {
        shopId = match2[1];
        itemId = match2[2];
      }
    }

    const cleanUrl = `${parsed.origin}${parsed.pathname}`;

    return {
      original: trimmed,
      cleanUrl,
      isShortLink,
      shopId,
      itemId,
    };
  } catch {
    return null;
  }
}

export async function convertLinkWithClient(
  client: WorkerShopeeClient,
  parsedUrl: ParsedShopeeUrl,
  subIds: string[] = []
): Promise<ShopeeConvertResult> {
  const cleanSubIds = subIds.filter(Boolean);

  let affiliateLink = parsedUrl.cleanUrl;
  let productName = 'Oferta Shopee';
  let imageUrl: string | null = null;
  let priceMin = 0;
  let priceMax: number | null = null;
  let pricePrevious: number | null = null;
  let commissionRate: number | null = null;
  let sellerCommissionRate: number | null = null;
  let shopeeCommissionRate: number | null = null;
  let commission: number | null = null;
  let ratingStar: number | null = null;
  let sales: number | null = null;
  let shopName: string | null = null;
  let itemId = parsedUrl.itemId;
  let shopId = parsedUrl.shopId;

  // 1. Try official Shopee GraphQL API
  try {
    affiliateLink = await client.generateShortLink(parsedUrl.cleanUrl, cleanSubIds);

    if (itemId) {
      try {
        const details = await client.getProductDetails(itemId, shopId || undefined);
        if (details) {
          productName = details.productName || productName;
          imageUrl = details.imageUrl || imageUrl;
          priceMin = Number(details.priceMin) || 0;
          priceMax = details.priceMax ? Number(details.priceMax) : null;
          ratingStar = details.ratingStar ? Number(details.ratingStar) : null;
          sales = details.sales ? Number(details.sales) : null;
          shopName = details.shopName || null;
          commissionRate = details.commissionRate ? Number(details.commissionRate) : null;
          sellerCommissionRate = details.sellerCommissionRate ? Number(details.sellerCommissionRate) : null;
          shopeeCommissionRate = details.shopeeCommissionRate ? Number(details.shopeeCommissionRate) : null;
          commission = details.commission ? Number(details.commission) : null;
        }
      } catch (e) {
        console.warn('Details lookup warning:', e);
      }
    }
  } catch (apiErr: any) {
    // If API credentials not configured, fallback to metadata scraper
    try {
      const response = await fetch(parsedUrl.cleanUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
        redirect: 'follow',
      });

      const finalUrl = response.url;
      const html = await response.text();

      const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i);
      if (ogTitle && ogTitle[1]) {
        productName = ogTitle[1].replace(/\s*\|\s*Shopee.*$/i, '').trim();
      }

      const ogImage = html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i);
      if (ogImage && ogImage[1]) {
        imageUrl = ogImage[1];
      }

      const urlObj = new URL(finalUrl);
      if (cleanSubIds.length > 0) {
        cleanSubIds.forEach((s, idx) => urlObj.searchParams.set(`sub_id${idx + 1}`, s));
      }
      affiliateLink = urlObj.toString();
    } catch {
      affiliateLink = parsedUrl.cleanUrl;
    }
  }

  return {
    originalUrl: parsedUrl.original,
    affiliateUrl: affiliateLink,
    productName,
    imageUrl,
    priceMin,
    priceMax,
    pricePrevious,
    commissionRate,
    sellerCommissionRate,
    shopeeCommissionRate,
    commission,
    ratingStar,
    sales,
    shopName,
    subIds: cleanSubIds,
    itemId,
    shopId,
    success: true,
  };
}

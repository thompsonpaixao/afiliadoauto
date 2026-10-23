import crypto from 'crypto';
import { db } from './db';

export interface ShopeeApiConfig {
  appId: string;
  appSecret: string;
  endpoint?: string;
}

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
  currentPrice?: number;
  originalPrice?: number | null;
  discountPercent?: number | null;
  priceSource?: string | null;
  priceUpdatedAt?: string | null;
  commissionRate?: number | null;
  sellerCommissionRate?: number | null;
  shopeeCommissionRate?: number | null;
  commission?: number | null;
  ratingStar?: number | null;
  priceDiscountRate?: number | null;
  sales?: number | null;
  shopName?: string | null;
  couponCode?: string | null;
  couponDescription?: string | null;
  couponValue?: string | null;
  couponExpiration?: string | null;
  subIds?: string[] | null;
  itemId?: string | null;
  shopId?: string | null;
  success: boolean;
  isPartial?: boolean;
  status?: 'converted' | 'error' | 'partial';
  error?: string | null;
}

export class ShopeeAffiliateClient {
  private config: ShopeeApiConfig;

  constructor(config?: Partial<ShopeeApiConfig>) {
    const data = db.read();
    const integration = data.integrations.find((i) => i.provider === 'shopee');
    const creds = integration?.credentials || {};

    this.config = {
      appId: config?.appId || creds.appId || process.env.SHOPEE_APP_ID || '',
      appSecret: config?.appSecret || creds.appSecret || process.env.SHOPEE_APP_SECRET || '',
      endpoint: config?.endpoint || creds.endpoint || 'https://open-api.affiliate.shopee.com.br/graphql',
    };
  }

  public isConfigured(): boolean {
    return Boolean(this.config.appId && this.config.appSecret);
  }

  /**
   * Generates authorization signature according to Shopee Affiliate Open API GraphQL specifications
   */
  private generateAuthHeader(payload: string): { authorization: string; timestamp: number } {
    const timestamp = Math.floor(Date.now() / 1000);
    const factor = `${this.config.appId}${timestamp}${payload}${this.config.appSecret}`;
    const signature = crypto.createHash('sha256').update(factor).digest('hex');

    const authorization = `SHA256 Credential=${this.config.appId}, Timestamp=${timestamp}, Signature=${signature}`;
    return { authorization, timestamp };
  }

  /**
   * Executes a signed GraphQL query against Shopee Affiliate Open API
   */
  public async executeGraphQL<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error('Credenciais da Shopee Affiliate API (App ID e App Secret) não configuradas.');
    }

    const payload = JSON.stringify({ query, variables });
    const { authorization } = this.generateAuthHeader(payload);

    const response = await fetch(this.config.endpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
      },
      body: payload,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopee API HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    if (data.errors && data.errors.length > 0) {
      throw new Error(data.errors.map((e: any) => e.message || 'Erro GraphQL').join(', '));
    }

    return data.data;
  }

  /**
   * Real GraphQL generateShortLink call
   */
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

    if (!shortLink) {
      throw new Error('Shopee API não retornou shortLink');
    }

    return shortLink;
  }

  /**
   * Query product offers by itemId/shopId or keyword
   */
  public async getProductDetails(itemId: string | number, shopId?: string | number): Promise<any> {
    const query = `
      query productOfferV2($itemId: Int64, $shopId: Int64) {
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

    // Shopee GraphQL Int64 scalar must be sent as String to prevent type errors
    const variables: Record<string, string> = {
      itemId: String(itemId),
      ...(shopId ? { shopId: String(shopId) } : {}),
    };

    const data = await this.executeGraphQL(query, variables);
    return data?.productOfferV2?.nodes?.[0] || null;
  }
}

/**
 * Intelligent Shopee URL Parser
 * Detects complete links, short links, extracts itemId, shopId, and cleans tracking clutter.
 */
export function parseShopeeUrl(rawUrl: string): ParsedShopeeUrl | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  const trimmed = rawUrl.trim();
  // Regex to detect Shopee domains
  const shopeeDomainRegex = /(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)?(shopee\.com\.br|shope\.ee|s\.shopee\.com\.br|shp\.ee|collshp\.com)\/[^\s<>"'{}|\\^`]+/i;
  const match = trimmed.match(shopeeDomainRegex);

  if (!match) return null;

  let fullUrl = match[0];
  if (!fullUrl.startsWith('http')) {
    fullUrl = `https://${fullUrl}`;
  }

  try {
    const parsed = new URL(fullUrl);
    const isShortLink = /s\.shopee\.com\.br|shope\.ee|shp\.ee/i.test(parsed.hostname);

    // Try extracting itemId and shopId from URL patterns:
    // -i.12345678.987654321, /product/12345678/987654321, /opaanlp/12345678/987654321
    let shopId: string | null = null;
    let itemId: string | null = null;

    const pattern1 = /-i\.(\d+)\.(\d+)/;
    const match1 = parsed.pathname.match(pattern1);
    if (match1) {
      shopId = match1[1];
      itemId = match1[2];
    } else {
      const pattern2 = /\/(?:product|opaanlp)\/(\d+)\/(\d+)/;
      const match2 = parsed.pathname.match(pattern2);
      if (match2) {
        shopId = match2[1];
        itemId = match2[2];
      }
    }

    // Clean tracking clutter from standard URL
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

/**
 * Extracts multiple Shopee URLs from raw text, CSV or Excel data.
 * Categorizes into valid, duplicates, invalid.
 */
export function extractShopeeUrlsFromText(text: string): {
  valid: ParsedShopeeUrl[];
  duplicates: string[];
  invalid: string[];
} {
  const lines = text.split(/[\r\n,;]+/);
  const validMap = new Map<string, ParsedShopeeUrl>();
  const duplicates: string[] = [];
  const invalid: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const parsed = parseShopeeUrl(line);
    if (!parsed) {
      invalid.push(line);
      continue;
    }

    // Check duplicate by clean URL
    if (validMap.has(parsed.cleanUrl)) {
      duplicates.push(parsed.original);
    } else {
      validMap.set(parsed.cleanUrl, parsed);
    }
  }

  return {
    valid: Array.from(validMap.values()),
    duplicates,
    invalid,
  };
}

/**
 * Resolves metadata from a product URL (via Shopee API, redirect unshortening, or HTML metadata extraction)
 */
export async function convertShopeeLink(
  parsedUrl: ParsedShopeeUrl,
  subIds: string[] = []
): Promise<ShopeeConvertResult> {
  const client = new ShopeeAffiliateClient();
  const cleanSubIds = subIds
    .filter(Boolean)
    .map((s) => s.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean)
    .slice(0, 5);

  let affiliateLink = parsedUrl.cleanUrl;
  let productName = '';
  let imageUrl: string | null = null;
  let priceMin = 0;
  let priceMax: number | null = null;
  let pricePrevious: number | null = null;
  let ratingStar: number | null = null;
  let sales: number | null = null;
  let shopName: string | null = null;
  let commissionRate: number | null = null;
  let sellerCommissionRate: number | null = null;
  let shopeeCommissionRate: number | null = null;
  let commission: number | null = null;
  let priceDiscountRate: number | null = null;
  let itemId = parsedUrl.itemId;
  let shopId = parsedUrl.shopId;
  let hasRealDetails = false;
  let resolvedHtml = '';

  // 1. If it's a short link or missing itemId, resolve redirect first to find canonical URL
  let resolvedUrl = parsedUrl.cleanUrl;
  if (parsedUrl.isShortLink || !itemId) {
    try {
      const response = await fetch(parsedUrl.cleanUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
        redirect: 'follow',
      });

      resolvedUrl = response.url || resolvedUrl;
      resolvedHtml = await response.text().catch(() => '');

      // Parse itemId and shopId from resolved destination URL
      try {
        const destParsed = new URL(resolvedUrl);
        const match1 = destParsed.pathname.match(/-i\.(\d+)\.(\d+)/);
        const match2 = destParsed.pathname.match(/\/(?:product|opaanlp)\/(\d+)\/(\d+)/);
        if (match1) {
          shopId = match1[1];
          itemId = match1[2];
        } else if (match2) {
          shopId = match2[1];
          itemId = match2[2];
        }

        // Try extracting slug from pathname as a fallback product name
        const slugMatch = destParsed.pathname.match(/^\/([^\/]+)-i\.\d+\.\d+/);
        if (slugMatch && slugMatch[1]) {
          const decodedSlug = decodeURIComponent(slugMatch[1]).replace(/[-_]+/g, ' ').trim();
          if (decodedSlug) {
            productName = decodedSlug;
          }
        }
      } catch {}
    } catch (e: any) {
      console.warn('[Shopee] Redirection resolve warning:', e.message);
    }

    if (resolvedUrl.includes('error_page')) {
      return {
        originalUrl: parsedUrl.original,
        affiliateUrl: '',
        productName: 'Link expirado ou inválido',
        priceMin: 0,
        success: false,
        status: 'error',
        error: 'Link encurtado expirado ou produto indisponível na Shopee.',
      };
    }
  }

  // 2. If Shopee Affiliate API is configured, use real official API
  if (client.isConfigured()) {
    try {
      affiliateLink = await client.generateShortLink(resolvedUrl || parsedUrl.cleanUrl, cleanSubIds);

      // Try fetching product details if itemId was resolved
      if (itemId) {
        try {
          const details = await client.getProductDetails(itemId, shopId || undefined);
          if (details) {
            productName = details.productName || productName;
            imageUrl = details.imageUrl || imageUrl;
            priceMin = Number(details.priceMin) || 0;
            priceMax = details.priceMax ? Number(details.priceMax) : null;
            priceDiscountRate = details.priceDiscountRate ? Number(details.priceDiscountRate) : null;
            ratingStar = details.ratingStar ? Number(details.ratingStar) : null;
            sales = details.sales ? Number(details.sales) : null;
            shopName = details.shopName || null;
            commissionRate = details.commissionRate ? Number(details.commissionRate) : null;
            sellerCommissionRate = details.sellerCommissionRate ? Number(details.sellerCommissionRate) : null;
            shopeeCommissionRate = details.shopeeCommissionRate ? Number(details.shopeeCommissionRate) : null;
            commission = details.commission ? Number(details.commission) : null;
            hasRealDetails = true;
          }
        } catch (detailErr: any) {
          console.warn('[Shopee] getProductDetails notice:', detailErr.message);
        }
      }
    } catch (apiErr: any) {
      console.error('[Shopee] Erro na chamada GraphQL da Shopee:', apiErr.message);
      return {
        originalUrl: parsedUrl.original,
        affiliateUrl: '',
        productName: 'Erro na conversão',
        priceMin: 0,
        success: false,
        status: 'error',
        error: `Erro Shopee API: ${apiErr.message}`,
      };
    }
  }

  // 3. Metadata Scraper Fallback (if API details were not retrieved)
  if (!hasRealDetails) {
    try {
      let html = resolvedHtml;
      if (!html) {
        const response = await fetch(resolvedUrl || parsedUrl.cleanUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept-Language': 'pt-BR,pt;q=0.9',
          },
          redirect: 'follow',
        });
        html = await response.text();
      }

      // Extract title from og:title or <title>
      const ogTitleMatch =
        html.match(/<meta\s+[^>]*property=["']og:title["'][^>]*content=["'](.*?)["']/i) ||
        html.match(/<meta\s+[^>]*content=["'](.*?)["'][^>]*property=["']og:title["']/i);
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);

      if (ogTitleMatch && ogTitleMatch[1]) {
        productName = ogTitleMatch[1].replace(/\s*\|\s*Shopee.*$/i, '').trim();
      } else if (!productName && titleMatch && titleMatch[1]) {
        productName = titleMatch[1].replace(/\s*\|\s*Shopee.*$/i, '').trim();
      }

      // Extract image from og:image
      const ogImageMatch =
        html.match(/<meta\s+[^>]*property=["']og:image["'][^>]*content=["'](.*?)["']/i) ||
        html.match(/<meta\s+[^>]*content=["'](.*?)["'][^>]*property=["']og:image["']/i);
      if (ogImageMatch && ogImageMatch[1]) {
        imageUrl = ogImageMatch[1];
      }

      // Extract price from metadata
      const ogPriceMatch =
        html.match(/product:price:amount["']\s+content=["']([\d.,]+)["']/i) ||
        html.match(/price["']\s*:\s*["']?([\d.,]+)["']?/i);
      if (ogPriceMatch && ogPriceMatch[1]) {
        const parsedPrice = parseFloat(ogPriceMatch[1].replace(',', '.'));
        if (!isNaN(parsedPrice) && parsedPrice > 0) {
          priceMin = parsedPrice;
          hasRealDetails = true;
        }
      }
    } catch (e: any) {
      console.warn('[Shopee] Scraper fallback aviso:', e.message);
    }
  }

  // 4. Verification: If shortLink was generated but details could not be found, mark partial/error
  const isPartial = !productName || productName === 'Oferta Shopee' || priceMin === 0;
  if (!productName || productName === 'Oferta Shopee') {
    productName = isPartial ? 'Produto Shopee (dados pendentes)' : productName;
  }

  return {
    originalUrl: parsedUrl.original,
    affiliateUrl: affiliateLink,
    productName,
    imageUrl,
    priceMin,
    priceMax,
    pricePrevious: null, // Never invented!
    currentPrice: priceMin,
    originalPrice: null,
    discountPercent: priceDiscountRate,
    priceSource: hasRealDetails ? 'shopee_api' : 'fallback',
    priceUpdatedAt: new Date().toISOString(),
    commissionRate,
    sellerCommissionRate,
    shopeeCommissionRate,
    commission,
    ratingStar,
    priceDiscountRate,
    sales,
    shopName,
    subIds: cleanSubIds,
    itemId,
    shopId,
    success: true,
    isPartial,
    status: isPartial ? 'partial' : 'converted',
  };
}

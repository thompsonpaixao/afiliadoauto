import { Product } from './db';

export const DEFAULT_MESSAGE_TEMPLATE = `*{{nome}}*

{{avaliacao}}

~De R$ {{preco_anterior}}~

✅ *Por R$ {{preco_atual}}*

🎟️ *Cupom: {{cupom}}*

👉 {{link}}`;

export function formatBrlCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatStars(rating: number | null | undefined): string {
  if (!rating || rating <= 0) return '';
  const rounded = Math.min(5, Math.max(1, Math.round(rating)));
  return '⭐'.repeat(rounded);
}

export interface FormatMessageOptions {
  product: Partial<Product>;
  template?: string;
  customLink?: string;
}

export function formatWhatsAppMessage(options: FormatMessageOptions): string {
  const { product, template = DEFAULT_MESSAGE_TEMPLATE, customLink } = options;

  const currentPrice = typeof product.currentPrice === 'number' ? product.currentPrice : (product.priceMin ?? 0);
  const originalPrice = typeof product.originalPrice === 'number' ? product.originalPrice : (product.pricePrevious ?? 0);

  const currentPriceFormatted = currentPrice && currentPrice > 0 ? formatBrlCurrency(currentPrice) : '';
  const previousPriceFormatted = originalPrice && currentPrice && originalPrice > currentPrice
    ? formatBrlCurrency(originalPrice)
    : '';

  const couponCode = product.couponCode && product.couponCode.trim() ? product.couponCode.trim() : '';
  const link = customLink || product.affiliateLink || product.productLink || '';
  const ratingText = formatStars(product.ratingStar);

  const discountFormatted = product.discountPercent
    ? `${product.discountPercent}% OFF`
    : (product.priceDiscountRate
      ? `${product.priceDiscountRate}% OFF`
      : (originalPrice && originalPrice > currentPrice
        ? `${Math.round(((originalPrice - currentPrice) / originalPrice) * 100)}% OFF`
        : ''));

  const commissionFormatted = product.commission
    ? `R$ ${formatBrlCurrency(product.commission)}`
    : (product.commissionRate ? `${product.commissionRate}%` : '');

  // Split template into lines to evaluate conditional lines
  const lines = template.split('\n');
  const processedLines: string[] = [];

  for (const rawLine of lines) {
    let line = rawLine;

    // RULE: Current price conditional check
    // If template line references {{preco_atual}} or contains "Por R$"
    if (line.includes('{{preco_atual}}') || line.toLowerCase().includes('por r$')) {
      if (!currentPriceFormatted) {
        continue; // Never show "Por R$ 0,00"
      }
    }

    // RULE: Previous price conditional check
    // If template line references {{preco_anterior}} or contains previous price indicator
    if (line.includes('{{preco_anterior}}') || line.toLowerCase().includes('de r$')) {
      if (!previousPriceFormatted) {
        // Omits the entire line if there is no real previous price
        continue;
      }
    }

    // RULE: Rating conditional check
    if (line.includes('{{avaliacao}}') || line.includes('⭐')) {
      if (!ratingText) {
        continue; // Omits the entire line if no real rating
      }
    }

    // RULE: Coupon conditional check
    // If template line references {{cupom}} or contains coupon indicator
    if (line.includes('{{cupom}}') || line.toLowerCase().includes('cupom:')) {
      if (!couponCode) {
        // Omits the entire line if there is no real coupon
        continue;
      }
    }

    // RULE: Discount conditional check
    if (line.includes('{{desconto}}')) {
      if (!discountFormatted) {
        continue;
      }
    }

    // RULE: Commission conditional check
    if (line.includes('{{comissao}}')) {
      if (!commissionFormatted) {
        continue;
      }
    }

    // Replace variables
    line = line
      .replace(/\{\{nome\}\}/g, product.productName || '')
      .replace(/\{\{preco_atual\}\}/g, currentPriceFormatted)
      .replace(/\{\{preco_anterior\}\}/g, previousPriceFormatted)
      .replace(/\{\{cupom\}\}/g, couponCode)
      .replace(/\{\{link\}\}/g, link)
      .replace(/\{\{avaliacao\}\}/g, ratingText)
      .replace(/\{\{desconto\}\}/g, discountFormatted)
      .replace(/\{\{comissao\}\}/g, commissionFormatted);

    processedLines.push(line);
  }

  // Join and collapse duplicate empty lines (never leave more than 1 consecutive empty line)
  const fullText = processedLines.join('\n');
  const cleaned = fullText
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned;
}

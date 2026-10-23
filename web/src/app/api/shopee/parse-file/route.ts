import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { parseShopeeUrl } from '@/lib/shopee';

export interface ParsedShopeeRow {
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
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const selectedColumn = formData.get('column') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
    }

    const filename = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    let urls: string[] = [];
    let structuredItems: ParsedShopeeRow[] = [];

    if (filename.endsWith('.txt')) {
      const text = buffer.toString('utf-8');
      const lines = text.split(/[\r\n]+/);
      for (const line of lines) {
        const parsed = parseShopeeUrl(line);
        if (parsed) {
          urls.push(parsed.original);
          structuredItems.push({
            rawUrl: parsed.original,
            productLink: parsed.cleanUrl,
          });
        }
      }
    } else if (
      filename.endsWith('.xlsx') ||
      filename.endsWith('.xls') ||
      filename.endsWith('.csv')
    ) {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const jsonData: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (jsonData.length > 0) {
        const headers: string[] = (jsonData[0] || []).map((h: any) => String(h || '').trim());

        // Header matcher helper (case-insensitive and ignores spaces/underscores)
        const findCol = (regex: RegExp) =>
          headers.findIndex((h) => regex.test(h.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()));

        const offerLinkIdx = findCol(/^(offerlink|linkoferta|urloferta)$/i);
        const productLinkIdx = findCol(/^(productlink|linkproduto|urlproduto|linkoriginal|producturl|url)$/i);
        const itemIdIdx = findCol(/^(itemid|iditem|idproduto|productid)$/i);
        const itemNameIdx = findCol(/^(itemname|productname|nomeproduto|nomeitem|nome|titulo|title)$/i);
        const priceIdx = findCol(/^(price|currentprice|preco|valor)$/i);
        const salesIdx = findCol(/^(sales|vendas|sold)$/i);
        const shopNameIdx = findCol(/^(shopname|nomeloja|loja|vendedor)$/i);
        const commRateIdx = findCol(/^(commissionrate|taxacomissao|taxadecomissao|comissao)$/i);
        const commIdx = findCol(/^(commission|comissao|valordecomissao)$/i);

        const isShopeeCsv = offerLinkIdx >= 0 || productLinkIdx >= 0;

        if (isShopeeCsv && !selectedColumn) {
          // Automatic Shopee CSV detection: parse rich rows directly without asking
          for (let r = 1; r < jsonData.length; r++) {
            const row = jsonData[r];
            if (!Array.isArray(row)) continue;

            const offerLinkRaw = offerLinkIdx >= 0 ? String(row[offerLinkIdx] || '').trim() : '';
            const productLinkRaw = productLinkIdx >= 0 ? String(row[productLinkIdx] || '').trim() : '';
            const itemIdRaw = itemIdIdx >= 0 ? String(row[itemIdIdx] || '').trim() : '';
            const itemNameRaw = itemNameIdx >= 0 ? String(row[itemNameIdx] || '').trim() : '';
            const priceVal = priceIdx >= 0 ? parseFloat(String(row[priceIdx] || '').replace(/[^\d.,]/g, '').replace(',', '.')) : undefined;
            const salesVal = salesIdx >= 0 ? parseInt(String(row[salesIdx] || '').replace(/\D/g, ''), 10) : undefined;
            const shopNameRaw = shopNameIdx >= 0 ? String(row[shopNameIdx] || '').trim() : '';
            const commRateVal = commRateIdx >= 0 ? parseFloat(String(row[commRateIdx] || '').replace(/[^\d.,]/g, '').replace(',', '.')) : undefined;
            const commVal = commIdx >= 0 ? parseFloat(String(row[commIdx] || '').replace(/[^\d.,]/g, '').replace(',', '.')) : undefined;

            const primaryUrl = offerLinkRaw || productLinkRaw;
            if (!primaryUrl) continue;

            const parsed = parseShopeeUrl(primaryUrl) || (productLinkRaw ? parseShopeeUrl(productLinkRaw) : null);
            if (parsed || primaryUrl.includes('shopee') || primaryUrl.includes('shp.ee')) {
              urls.push(primaryUrl);
              structuredItems.push({
                offerLink: offerLinkRaw || undefined,
                productLink: productLinkRaw || parsed?.cleanUrl || undefined,
                itemId: itemIdRaw || parsed?.itemId || undefined,
                itemName: itemNameRaw || undefined,
                price: !isNaN(priceVal as number) ? priceVal : undefined,
                sales: !isNaN(salesVal as number) ? salesVal : undefined,
                shopName: shopNameRaw || undefined,
                commissionRate: !isNaN(commRateVal as number) ? commRateVal : undefined,
                commission: !isNaN(commVal as number) ? commVal : undefined,
                rawUrl: primaryUrl,
              });
            }
          }
        } else {
          // Generic link file: scan columns
          const colStats: { [colIdx: number]: { count: number; sample: string } } = {};
          const detectedColumns: { name: string; urlCount: number; sample: string }[] = [];

          for (let r = 0; r < jsonData.length; r++) {
            const row = jsonData[r];
            if (!Array.isArray(row)) continue;
            for (let c = 0; c < row.length; c++) {
              const val = String(row[c] || '').trim();
              if (parseShopeeUrl(val)) {
                if (!colStats[c]) {
                  colStats[c] = { count: 0, sample: val };
                }
                colStats[c].count++;
              }
            }
          }

          for (const [colIdxStr, stats] of Object.entries(colStats)) {
            const colIdx = Number(colIdxStr);
            const colHeader = headers[colIdx] ? String(headers[colIdx]).trim() : `Coluna ${colIdx + 1}`;
            detectedColumns.push({
              name: colHeader,
              urlCount: stats.count,
              sample: stats.sample,
            });
          }

          let targetColIndex = -1;
          if (selectedColumn) {
            targetColIndex = headers.findIndex((h) => String(h).trim() === selectedColumn.trim());
          } else if (detectedColumns.length === 1) {
            const onlyColName = detectedColumns[0].name;
            targetColIndex = headers.findIndex((h) => String(h).trim() === onlyColName);
            if (targetColIndex === -1 && onlyColName.startsWith('Coluna ')) {
              targetColIndex = Number(onlyColName.replace('Coluna ', '')) - 1;
            }
          }

          if (targetColIndex >= 0) {
            for (let r = (headers.length > 0 ? 1 : 0); r < jsonData.length; r++) {
              const val = String(jsonData[r]?.[targetColIndex] || '').trim();
              const parsed = parseShopeeUrl(val);
              if (parsed) {
                urls.push(parsed.original);
                structuredItems.push({
                  rawUrl: parsed.original,
                  productLink: parsed.cleanUrl,
                });
              }
            }
          } else if (detectedColumns.length > 1 && !selectedColumn) {
            return NextResponse.json({
              needsColumnSelection: true,
              detectedColumns,
              message: 'Múltiplas colunas com links encontradas. Por favor selecione a coluna desejada.',
            });
          } else {
            for (let r = 0; r < jsonData.length; r++) {
              const row = jsonData[r];
              if (!Array.isArray(row)) continue;
              for (let c = 0; c < row.length; c++) {
                const val = String(row[c] || '').trim();
                const parsed = parseShopeeUrl(val);
                if (parsed) {
                  urls.push(parsed.original);
                  structuredItems.push({
                    rawUrl: parsed.original,
                    productLink: parsed.cleanUrl,
                  });
                }
              }
            }
          }
        }
      }
    } else {
      return NextResponse.json(
        { error: 'Formato não suportado. Envie arquivos .txt, .csv, .xlsx ou .xls.' },
        { status: 400 }
      );
    }

    const uniqueUrls = Array.from(new Set(urls.map((u) => u.trim()))).filter(Boolean);

    return NextResponse.json({
      success: true,
      filename: file.name,
      isStructured: structuredItems.length > 0,
      totalFound: structuredItems.length > 0 ? structuredItems.length : uniqueUrls.length,
      items: structuredItems,
      urls: uniqueUrls,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

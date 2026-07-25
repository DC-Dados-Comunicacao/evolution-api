import { Logger } from '@config/logger.config';
import axios from 'axios';

export interface ParsedReceiptItem {
  description: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  totalPrice: number;
}

export interface ParsedReceipt {
  accessKey?: string;
  storeName?: string;
  storeCnpj?: string;
  purchaseDate?: Date;
  totalAmount: number;
  items: ParsedReceiptItem[];
  rawText?: string;
}

/**
 * Parser for Brazilian NFC-e (Nota Fiscal de Consumidor Eletrônica). Consumers
 * scan the QR code on the receipt which points to a SEFAZ "consulta" page; that
 * page (or the QR content itself) carries a 44-digit access key and, when the
 * HTML portal is available, the full itemized list.
 */
export class NfceService {
  private readonly logger = new Logger('NfceService');

  /**
   * Whether the given text looks like an NFC-e reference (SEFAZ URL or a bare
   * 44-digit access key).
   */
  public isNfce(text: string): boolean {
    if (!text) return false;
    const normalized = text.trim();
    if (/\bnfce\b/i.test(normalized) || /qrcode/i.test(normalized)) return true;
    if (/https?:\/\/[^\s]*(fazenda|sefaz)[^\s]*/i.test(normalized)) return true;
    return this.extractAccessKey(normalized) !== undefined;
  }

  /**
   * Extract the first URL that points to a SEFAZ NFC-e consultation page.
   */
  public extractUrl(text: string): string | undefined {
    if (!text) return undefined;
    const match = text.match(/https?:\/\/[^\s]+/i);
    if (!match) return undefined;
    const url = match[0];
    if (/(fazenda|sefaz|nfce|nfe)/i.test(url) || url.includes('chNFe=') || url.includes('p=')) {
      return url;
    }
    return undefined;
  }

  /**
   * Extract a 44-digit access key from an arbitrary string (URL param `chNFe`,
   * `p=` payload or a bare run of 44 digits).
   */
  public extractAccessKey(text: string): string | undefined {
    if (!text) return undefined;

    const paramMatch = text.match(/(?:chNFe=|p=)(\d{44})/i);
    if (paramMatch) return paramMatch[1];

    const digitsOnly = text.replace(/\D/g, '');
    const bareMatch = digitsOnly.match(/\d{44}/);
    if (bareMatch) return bareMatch[0];

    return undefined;
  }

  /**
   * Fetch and parse an NFC-e from its SEFAZ consultation URL. State portals do
   * not share a single HTML layout, so parsing is best-effort and defensive:
   * whatever cannot be extracted is simply left undefined.
   */
  public async parseFromUrl(url: string): Promise<ParsedReceipt> {
    const accessKey = this.extractAccessKey(url);

    let html = '';
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        maxRedirects: 5,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      html = typeof response.data === 'string' ? response.data : String(response.data ?? '');
    } catch (error: any) {
      this.logger.error(`Failed to fetch NFC-e page: ${error?.message}`);
      throw new Error('Não foi possível acessar a página da nota fiscal (SEFAZ).');
    }

    return this.parseHtml(html, accessKey);
  }

  private parseHtml(html: string, accessKey?: string): ParsedReceipt {
    const text = this.htmlToText(html);

    const items = this.extractItems(html);
    const totalAmount = this.extractTotal(text) ?? items.reduce((sum, item) => sum + item.totalPrice, 0);

    return {
      accessKey: accessKey ?? this.extractAccessKey(text),
      storeName: this.extractStoreName(html, text),
      storeCnpj: this.extractCnpj(text),
      purchaseDate: this.extractDate(text),
      totalAmount,
      items,
      rawText: text.slice(0, 8000),
    };
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private toNumber(value: string | undefined): number {
    if (!value) return 0;
    const normalized = value
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /**
   * Extract items from the standard SEFAZ NFC-e portal table. Each product row
   * exposes the description, quantity (Qtde), unit (UN) and total (Vl. Total).
   */
  private extractItems(html: string): ParsedReceiptItem[] {
    const items: ParsedReceiptItem[] = [];

    // Standard portal: each product sits in a <tr> with a description span
    // followed by "Qtde.: X UN: Y Vl. Unit.: Z" and a total cell.
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const rowText = this.htmlToText(rowMatch[1]);

      const qtyMatch = rowText.match(/Qtde\.?:?\s*([\d.,]+)/i);
      const totalMatch = rowText.match(/Vl\.?\s*Total:?\s*R?\$?\s*([\d.,]+)/i);
      if (!qtyMatch || !totalMatch) continue;

      const unitMatch = rowText.match(/UN:?\s*([A-Za-zÀ-ÿ]+)/i);
      const unitPriceMatch = rowText.match(/Vl\.?\s*Unit\.?:?\s*R?\$?\s*([\d.,]+)/i);

      // Description is the text before "Qtde".
      const description = rowText
        .slice(0, rowText.search(/Qtde/i))
        .replace(/\(C[óo]digo:.*?\)/i, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!description) continue;

      const quantity = this.toNumber(qtyMatch[1]);
      const totalPrice = this.toNumber(totalMatch[1]);
      const unitPrice = unitPriceMatch ? this.toNumber(unitPriceMatch[1]) : quantity ? totalPrice / quantity : 0;

      items.push({
        description,
        quantity: quantity || 1,
        unit: unitMatch ? unitMatch[1].toUpperCase() : undefined,
        unitPrice,
        totalPrice,
      });
    }

    return items;
  }

  private extractTotal(text: string): number | undefined {
    const match =
      text.match(/Valor\s+total\s+R?\$?\s*([\d.,]+)/i) ||
      text.match(/Valor\s+a\s+pagar\s+R?\$?\s*([\d.,]+)/i) ||
      text.match(/Total\s+R?\$?\s*([\d.,]+)/i);
    return match ? this.toNumber(match[1]) : undefined;
  }

  private extractCnpj(text: string): string | undefined {
    const match = text.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
    return match ? match[1] : undefined;
  }

  private extractStoreName(html: string, text: string): string | undefined {
    const titleMatch = html.match(/<h[1-6][^>]*>([^<]{3,120})<\/h[1-6]>/i);
    if (titleMatch) {
      const candidate = titleMatch[1].replace(/\s+/g, ' ').trim();
      if (candidate && !/nota\s+fiscal/i.test(candidate)) return candidate;
    }
    // Fallback: text that precedes the CNPJ label.
    const beforeCnpj = text.match(/([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9 .&'-]{4,80})\s*CNPJ/);
    return beforeCnpj ? beforeCnpj[1].trim() : undefined;
  }

  private extractDate(text: string): Date | undefined {
    const match = text.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):?(\d{2})?/);
    if (match) {
      const [, day, month, year, hour, minute, second] = match;
      const date = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second ?? '0'),
      );
      if (!Number.isNaN(date.getTime())) return date;
    }

    const dateOnly = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (dateOnly) {
      const [, day, month, year] = dateOnly;
      const date = new Date(Number(year), Number(month) - 1, Number(day));
      if (!Number.isNaN(date.getTime())) return date;
    }

    return undefined;
  }
}

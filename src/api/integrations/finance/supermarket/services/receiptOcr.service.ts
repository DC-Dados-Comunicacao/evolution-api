import { Logger } from '@config/logger.config';
import OpenAI from 'openai';

import { ParsedReceipt, ParsedReceiptItem } from './nfce.service';

export interface OcrInput {
  apiKey: string;
  model?: string;
  // Data URL or remote URL of the receipt image.
  imageUrl?: string;
  // Raw base64 (without data URL prefix) + mime type.
  base64?: string;
  mimeType?: string;
}

const EXTRACTION_PROMPT = `Você é um extrator de dados de cupons fiscais de supermercado brasileiros.
Analise a imagem do cupom/nota e devolva SOMENTE um JSON válido, sem comentários, com o formato:
{
  "storeName": string | null,
  "storeCnpj": string | null,
  "purchaseDate": string | null,           // ISO 8601, ex: "2025-07-20T18:30:00"
  "totalAmount": number,                    // valor total pago
  "items": [
    {
      "description": string,                // nome do produto como aparece
      "quantity": number,                   // quantidade (1 se não houver)
      "unit": string | null,                // UN, KG, L, etc
      "unitPrice": number,                  // preço unitário
      "totalPrice": number                  // preço total do item
    }
  ]
}
Regras: use ponto como separador decimal; não invente itens; se um valor não existir use null (ou 1 para quantity).`;

/**
 * Extracts structured receipt data from a photo or PDF page using an OpenAI
 * vision-capable model. Used when the user sends a picture of the receipt
 * instead of the NFC-e QR/link.
 */
export class ReceiptOcrService {
  private readonly logger = new Logger('ReceiptOcrService');

  public async parse(input: OcrInput): Promise<ParsedReceipt> {
    const client = new OpenAI({ apiKey: input.apiKey });
    const model = input.model || 'gpt-4o-mini';

    const imageUrl = input.imageUrl
      ? input.imageUrl
      : `data:${input.mimeType || 'image/jpeg'};base64,${input.base64}`;

    let content: string;
    try {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: EXTRACTION_PROMPT },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
      });
      content = completion.choices?.[0]?.message?.content ?? '';
    } catch (error: any) {
      this.logger.error(`OpenAI OCR request failed: ${error?.message}`);
      throw new Error('Falha ao ler a imagem da nota com a IA. Verifique a credencial da OpenAI.');
    }

    return this.normalize(content);
  }

  private normalize(content: string): ParsedReceipt {
    let data: any;
    try {
      // The model may wrap JSON in code fences despite instructions.
      const cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim();
      data = JSON.parse(cleaned);
    } catch (error: any) {
      this.logger.error(`Could not parse OCR JSON: ${error?.message}`);
      throw new Error('A IA não retornou dados estruturados da nota.');
    }

    const items: ParsedReceiptItem[] = Array.isArray(data.items)
      ? data.items
          .map((item: any) => {
            const quantity = this.num(item.quantity, 1);
            const totalPrice = this.num(item.totalPrice, 0);
            const unitPrice = this.num(item.unitPrice, quantity ? totalPrice / quantity : 0);
            return {
              description: String(item.description ?? '').trim(),
              quantity: quantity || 1,
              unit: item.unit ? String(item.unit).toUpperCase() : undefined,
              unitPrice,
              totalPrice,
            };
          })
          .filter((item: ParsedReceiptItem) => item.description.length > 0)
      : [];

    const totalAmount = this.num(data.totalAmount, items.reduce((sum, item) => sum + item.totalPrice, 0));

    let purchaseDate: Date | undefined;
    if (data.purchaseDate) {
      const parsed = new Date(data.purchaseDate);
      if (!Number.isNaN(parsed.getTime())) purchaseDate = parsed;
    }

    return {
      storeName: data.storeName ? String(data.storeName).trim() : undefined,
      storeCnpj: data.storeCnpj ? String(data.storeCnpj).trim() : undefined,
      purchaseDate,
      totalAmount,
      items,
    };
  }

  private num(value: any, fallback: number): number {
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}

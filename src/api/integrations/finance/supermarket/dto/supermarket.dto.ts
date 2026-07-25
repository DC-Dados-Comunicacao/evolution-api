export class IngestReceiptDto {
  // NFC-e SEFAZ URL or QR code content.
  url?: string;
  // Base64 image/pdf content (without data URL prefix).
  base64?: string;
  mimeType?: string;
  // Remote URL of an image to OCR.
  imageUrl?: string;
  // Optional WhatsApp JID of who sent the receipt.
  remoteJid?: string;
  // Optional OpenAI API key/model override for OCR (falls back to instance/global creds).
  openaiApiKey?: string;
  openaiModel?: string;
}

export class ManualReceiptItemDto {
  description: string;
  category?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  totalPrice?: number;
}

export class ManualReceiptDto {
  storeName?: string;
  storeCnpj?: string;
  purchaseDate?: string;
  remoteJid?: string;
  items: ManualReceiptItemDto[];
}

export class ReceiptQueryDto {
  startDate?: string;
  endDate?: string;
  category?: string;
  page?: number;
  offset?: number;
}

export class AnalyticsQueryDto {
  startDate?: string;
  endDate?: string;
}

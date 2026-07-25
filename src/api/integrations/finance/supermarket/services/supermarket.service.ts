import { InstanceDto } from '@api/dto/instance.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { ConfigService, Openai } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { BadRequestException, NotFoundException } from '@exceptions';

import {
  AnalyticsQueryDto,
  IngestReceiptDto,
  ManualReceiptDto,
  ReceiptQueryDto,
} from '../dto/supermarket.dto';
import { SupermarketCategoryService } from './category.service';
import { NfceService, ParsedReceipt } from './nfce.service';
import { ReceiptOcrService } from './receiptOcr.service';

export class SupermarketService {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly configService: ConfigService,
    private readonly prismaRepository: PrismaRepository,
  ) {}

  private readonly logger = new Logger('SupermarketService');
  private readonly categoryService = new SupermarketCategoryService();
  private readonly nfceService = new NfceService();
  private readonly ocrService = new ReceiptOcrService();

  private async resolveInstanceId(instanceName: string): Promise<string> {
    const instance = await this.prismaRepository.instance.findFirst({
      where: { name: instanceName },
    });

    if (!instance) {
      throw new NotFoundException(`Instance "${instanceName}" not found`);
    }

    return instance.id;
  }

  private async resolveOpenAiKey(instanceId: string, override?: string): Promise<string> {
    if (override) return override;

    const creds = await this.prismaRepository.openaiCreds.findFirst({
      where: { instanceId },
    });
    if (creds?.apiKey) return creds.apiKey;

    const globalKey = this.configService.get<Openai>('OPENAI')?.API_KEY_GLOBAL;
    if (globalKey) return globalKey;

    throw new BadRequestException(
      'Nenhuma credencial da OpenAI encontrada para ler a imagem. Configure uma credencial ou envie o link/QR da NFC-e.',
    );
  }

  /**
   * Main entry point: given an NFC-e URL or a receipt image, parse it, classify
   * the items, persist the receipt and (optionally) reply on WhatsApp.
   */
  public async ingest(instance: InstanceDto, data: IngestReceiptDto) {
    const instanceId = await this.resolveInstanceId(instance.instanceName);

    let parsed: ParsedReceipt;
    let source: 'NFCE_LINK' | 'IMAGE' | 'PDF';
    let sourceUrl: string | undefined;

    if (data.url && this.nfceService.isNfce(data.url)) {
      const url = this.nfceService.extractUrl(data.url) ?? data.url;
      parsed = await this.nfceService.parseFromUrl(url);
      source = 'NFCE_LINK';
      sourceUrl = url;
    } else if (data.base64 || data.imageUrl) {
      const apiKey = await this.resolveOpenAiKey(instanceId, data.openaiApiKey);
      parsed = await this.ocrService.parse({
        apiKey,
        model: data.openaiModel,
        base64: data.base64,
        mimeType: data.mimeType,
        imageUrl: data.imageUrl,
      });
      source = data.mimeType?.includes('pdf') ? 'PDF' : 'IMAGE';
      sourceUrl = data.imageUrl;
    } else {
      throw new BadRequestException(
        'Envie o link/QR da NFC-e (url) ou a imagem da nota (base64/imageUrl).',
      );
    }

    return this.finalizeIngest(instance, instanceId, parsed, source, sourceUrl, data.remoteJid);
  }

  /**
   * Ingest a receipt from an uploaded file (image, PDF or text). The extraction
   * strategy is chosen by mime type: images go through vision OCR, PDFs/text are
   * read and interpreted, and NFC-e references embedded in text are followed.
   */
  public async ingestFile(
    instance: InstanceDto,
    file: { buffer: Buffer; mimetype?: string; originalname?: string },
    remoteJid?: string,
    openai?: { apiKey?: string; model?: string },
  ) {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('Nenhum arquivo recebido no campo "file".');
    }

    const instanceId = await this.resolveInstanceId(instance.instanceName);
    const mimetype = (file.mimetype || '').toLowerCase();
    const name = (file.originalname || '').toLowerCase();

    let parsed: ParsedReceipt;
    let source: 'NFCE_LINK' | 'IMAGE' | 'PDF' | 'MANUAL';
    let sourceUrl: string | undefined;

    if (mimetype.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|heic)$/.test(name)) {
      const apiKey = await this.resolveOpenAiKey(instanceId, openai?.apiKey);
      parsed = await this.ocrService.parse({
        apiKey,
        model: openai?.model,
        base64: file.buffer.toString('base64'),
        mimeType: mimetype || 'image/jpeg',
      });
      source = 'IMAGE';
    } else if (mimetype === 'application/pdf' || name.endsWith('.pdf')) {
      const text = await this.extractPdfText(file.buffer);
      const url = this.nfceService.extractUrl(text);
      if (url) {
        parsed = await this.nfceService.parseFromUrl(url);
        source = 'NFCE_LINK';
        sourceUrl = url;
      } else {
        const apiKey = await this.resolveOpenAiKey(instanceId, openai?.apiKey);
        parsed = await this.ocrService.parseFromText({ apiKey, model: openai?.model, text });
        source = 'PDF';
      }
    } else {
      // Plain text / CSV / unknown: try to read it as text.
      const text = file.buffer.toString('utf8');
      if (!text.trim()) {
        throw new BadRequestException(
          'Formato de arquivo não suportado. Envie uma imagem, um PDF ou o link/QR da NFC-e.',
        );
      }
      if (this.nfceService.isNfce(text)) {
        const url = this.nfceService.extractUrl(text) ?? text;
        parsed = await this.nfceService.parseFromUrl(url);
        source = 'NFCE_LINK';
        sourceUrl = url;
      } else {
        const apiKey = await this.resolveOpenAiKey(instanceId, openai?.apiKey);
        parsed = await this.ocrService.parseFromText({ apiKey, model: openai?.model, text });
        source = 'MANUAL';
      }
    }

    return this.finalizeIngest(instance, instanceId, parsed, source, sourceUrl, remoteJid);
  }

  private async finalizeIngest(
    instance: InstanceDto,
    instanceId: string,
    parsed: ParsedReceipt,
    source: 'NFCE_LINK' | 'IMAGE' | 'PDF' | 'MANUAL',
    sourceUrl: string | undefined,
    remoteJid: string | undefined,
  ) {
    if (!parsed.items || parsed.items.length === 0) {
      throw new BadRequestException('Não foi possível identificar itens nesta nota.');
    }

    const receipt = await this.persistReceipt(instanceId, {
      source,
      accessKey: parsed.accessKey,
      storeName: parsed.storeName,
      storeCnpj: parsed.storeCnpj,
      purchaseDate: parsed.purchaseDate,
      totalAmount: parsed.totalAmount,
      sourceUrl,
      rawText: parsed.rawText,
      remoteJid,
      items: parsed.items,
    });

    if (remoteJid) {
      await this.sendWhatsappSummary(instance.instanceName, remoteJid, receipt);
    }

    return receipt;
  }

  private async extractPdfText(buffer: Buffer): Promise<string> {
    let pdfParse: (data: Buffer) => Promise<{ text: string }>;
    try {
      // Lazily required so the app boots even if the optional dep is missing.
      pdfParse = require('pdf-parse');
    } catch {
      throw new BadRequestException(
        'Leitura de PDF indisponível (dependência "pdf-parse" não instalada). Envie a nota como imagem ou link/QR.',
      );
    }

    try {
      const result = await pdfParse(buffer);
      const text = (result?.text || '').trim();
      if (!text) {
        throw new Error('empty');
      }
      return text;
    } catch {
      throw new BadRequestException(
        'Não foi possível extrair texto deste PDF (parece ser digitalizado). Envie a nota como imagem (foto) para leitura por IA.',
      );
    }
  }

  public async createManual(instance: InstanceDto, data: ManualReceiptDto) {
    const instanceId = await this.resolveInstanceId(instance.instanceName);

    const items = data.items.map((item) => {
      const quantity = item.quantity ?? 1;
      const totalPrice = item.totalPrice ?? (item.unitPrice ?? 0) * quantity;
      const unitPrice = item.unitPrice ?? (quantity ? totalPrice / quantity : 0);
      return {
        description: item.description,
        quantity,
        unit: item.unit,
        unitPrice,
        totalPrice,
        category: this.categoryService.normalizeCategory(item.category, item.description),
      };
    });

    const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);

    return this.persistReceipt(instanceId, {
      source: 'MANUAL',
      storeName: data.storeName,
      storeCnpj: data.storeCnpj,
      purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : new Date(),
      totalAmount,
      remoteJid: data.remoteJid,
      items,
    });
  }

  private async persistReceipt(
    instanceId: string,
    receipt: {
      source: 'NFCE_LINK' | 'IMAGE' | 'PDF' | 'MANUAL';
      accessKey?: string;
      storeName?: string;
      storeCnpj?: string;
      purchaseDate?: Date;
      totalAmount: number;
      sourceUrl?: string;
      rawText?: string;
      remoteJid?: string;
      items: {
        description: string;
        category?: string;
        quantity: number;
        unit?: string;
        unitPrice: number;
        totalPrice: number;
      }[];
    },
  ) {
    // Avoid duplicated fiscal receipts (same access key already imported).
    if (receipt.accessKey) {
      const existing = await this.prismaRepository.supermarketReceipt.findUnique({
        where: { accessKey: receipt.accessKey },
        include: { Items: true },
      });
      if (existing) {
        this.logger.warn(`Receipt with accessKey ${receipt.accessKey} already exists, returning existing.`);
        return existing;
      }
    }

    const items = receipt.items.map((item) => ({
      description: item.description.slice(0, 500),
      category: this.categoryService.normalizeCategory(item.category, item.description),
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
    }));

    return this.prismaRepository.supermarketReceipt.create({
      data: {
        instanceId,
        source: receipt.source,
        status: 'PROCESSED',
        accessKey: receipt.accessKey,
        storeName: receipt.storeName,
        storeCnpj: receipt.storeCnpj,
        purchaseDate: receipt.purchaseDate,
        totalAmount: receipt.totalAmount,
        itemCount: items.length,
        sourceUrl: receipt.sourceUrl,
        rawText: receipt.rawText,
        remoteJid: receipt.remoteJid,
        Items: { create: items },
      },
      include: { Items: true },
    });
  }

  public async listReceipts(instance: InstanceDto, query: ReceiptQueryDto) {
    const instanceId = await this.resolveInstanceId(instance.instanceName);
    const where: any = { instanceId };

    const dateFilter = this.buildDateFilter(query.startDate, query.endDate);
    if (dateFilter) where.purchaseDate = dateFilter;

    const take = query.offset ? Number(query.offset) : 50;
    const skip = query.page ? (Number(query.page) - 1) * take : 0;

    const receipts = await this.prismaRepository.supermarketReceipt.findMany({
      where,
      include: { Items: !!query.category },
      orderBy: { purchaseDate: 'desc' },
      take,
      skip,
    });

    if (query.category) {
      return receipts.filter((receipt) =>
        receipt.Items?.some((item) => item.category === query.category),
      );
    }

    return receipts;
  }

  public async getReceipt(instance: InstanceDto, receiptId: string) {
    const instanceId = await this.resolveInstanceId(instance.instanceName);
    const receipt = await this.prismaRepository.supermarketReceipt.findFirst({
      where: { id: receiptId, instanceId },
      include: { Items: true },
    });

    if (!receipt) {
      throw new NotFoundException('Nota fiscal não encontrada.');
    }

    return receipt;
  }

  public async deleteReceipt(instance: InstanceDto, receiptId: string) {
    const instanceId = await this.resolveInstanceId(instance.instanceName);
    const receipt = await this.prismaRepository.supermarketReceipt.findFirst({
      where: { id: receiptId, instanceId },
    });

    if (!receipt) {
      throw new NotFoundException('Nota fiscal não encontrada.');
    }

    await this.prismaRepository.supermarketReceipt.delete({ where: { id: receiptId } });
    return { deleted: true, id: receiptId };
  }

  /**
   * Aggregated spending analytics powering the dashboard: totals, breakdown by
   * category, monthly evolution, top items and top stores.
   */
  public async analytics(instance: InstanceDto, query: AnalyticsQueryDto) {
    const instanceId = await this.resolveInstanceId(instance.instanceName);
    const dateFilter = this.buildDateFilter(query.startDate, query.endDate);

    const receipts = await this.prismaRepository.supermarketReceipt.findMany({
      where: {
        instanceId,
        ...(dateFilter ? { purchaseDate: dateFilter } : {}),
      },
      include: { Items: true },
      orderBy: { purchaseDate: 'asc' },
    });

    const categoryTotals: Record<string, { total: number; itemCount: number }> = {};
    const monthlyTotals: Record<string, number> = {};
    const storeTotals: Record<string, { total: number; visits: number }> = {};
    const itemTotals: Record<string, { total: number; quantity: number; category: string }> = {};

    let grandTotal = 0;
    let totalItems = 0;

    for (const receipt of receipts) {
      const receiptTotal = Number(receipt.totalAmount) || 0;
      grandTotal += receiptTotal;

      const monthKey = receipt.purchaseDate
        ? this.monthKey(receipt.purchaseDate)
        : this.monthKey(receipt.createdAt ?? new Date());
      monthlyTotals[monthKey] = (monthlyTotals[monthKey] ?? 0) + receiptTotal;

      const storeName = receipt.storeName || 'Não identificado';
      if (!storeTotals[storeName]) storeTotals[storeName] = { total: 0, visits: 0 };
      storeTotals[storeName].total += receiptTotal;
      storeTotals[storeName].visits += 1;

      for (const item of receipt.Items ?? []) {
        const itemTotal = Number(item.totalPrice) || 0;
        totalItems += 1;

        if (!categoryTotals[item.category]) categoryTotals[item.category] = { total: 0, itemCount: 0 };
        categoryTotals[item.category].total += itemTotal;
        categoryTotals[item.category].itemCount += 1;

        const itemKey = item.description.toLowerCase();
        if (!itemTotals[itemKey]) {
          itemTotals[itemKey] = { total: 0, quantity: 0, category: item.category };
        }
        itemTotals[itemKey].total += itemTotal;
        itemTotals[itemKey].quantity += Number(item.quantity) || 0;
      }
    }

    const byCategory = Object.entries(categoryTotals)
      .map(([category, value]) => ({
        category,
        total: this.round(value.total),
        itemCount: value.itemCount,
        percentage: grandTotal ? this.round((value.total / grandTotal) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const byMonth = Object.entries(monthlyTotals)
      .map(([month, total]) => ({ month, total: this.round(total) }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const topStores = Object.entries(storeTotals)
      .map(([store, value]) => ({ store, total: this.round(value.total), visits: value.visits }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const topItems = Object.entries(itemTotals)
      .map(([description, value]) => ({
        description,
        category: value.category,
        total: this.round(value.total),
        quantity: this.round(value.quantity),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    return {
      summary: {
        totalSpent: this.round(grandTotal),
        receiptCount: receipts.length,
        itemCount: totalItems,
        averageTicket: receipts.length ? this.round(grandTotal / receipts.length) : 0,
        topCategory: byCategory[0]?.category ?? null,
        period: {
          start: query.startDate ?? (receipts[0]?.purchaseDate ?? null),
          end: query.endDate ?? (receipts[receipts.length - 1]?.purchaseDate ?? null),
        },
      },
      byCategory,
      byMonth,
      topStores,
      topItems,
    };
  }

  private async sendWhatsappSummary(instanceName: string, remoteJid: string, receipt: any) {
    try {
      const waInstance = this.waMonitor.waInstances[instanceName];
      if (!waInstance) return;

      const categories: Record<string, number> = {};
      for (const item of receipt.Items ?? []) {
        categories[item.category] = (categories[item.category] ?? 0) + (Number(item.totalPrice) || 0);
      }

      const topCategories = Object.entries(categories)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([category, total]) => `• ${category}: ${this.formatBRL(total)}`)
        .join('\n');

      const store = receipt.storeName ? `🏪 ${receipt.storeName}\n` : '';
      const text =
        `🧾 *Nota registrada!*\n${store}` +
        `🛒 ${receipt.itemCount} itens\n` +
        `💰 Total: ${this.formatBRL(Number(receipt.totalAmount) || 0)}\n\n` +
        `*Onde você gastou:*\n${topCategories}`;

      await waInstance.textMessage({ number: remoteJid.split('@')[0], text }, false);
    } catch (error: any) {
      this.logger.error(`Failed to send WhatsApp summary: ${error?.message}`);
    }
  }

  private buildDateFilter(startDate?: string, endDate?: string) {
    if (!startDate && !endDate) return undefined;
    const filter: any = {};
    if (startDate) filter.gte = new Date(startDate);
    if (endDate) filter.lte = new Date(endDate);
    return filter;
  }

  private monthKey(date: Date): string {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private formatBRL(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
}

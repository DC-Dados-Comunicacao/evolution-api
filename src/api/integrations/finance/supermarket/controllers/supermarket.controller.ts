import { InstanceDto } from '@api/dto/instance.dto';
import { Logger } from '@config/logger.config';

import {
  AnalyticsQueryDto,
  IngestReceiptDto,
  ManualReceiptDto,
  ReceiptQueryDto,
} from '../dto/supermarket.dto';
import { NfceService } from '../services/nfce.service';
import { SupermarketService } from '../services/supermarket.service';

export type SupermarketEmitData = {
  instance: InstanceDto;
  remoteJid: string;
  msg: any;
  pushName?: string;
};

export class SupermarketController {
  constructor(private readonly supermarketService: SupermarketService) {}

  private readonly logger = new Logger('SupermarketController');
  private readonly nfceService = new NfceService();

  public async ingestReceipt(instance: InstanceDto, data: IngestReceiptDto) {
    return this.supermarketService.ingest(instance, data);
  }

  public async createManualReceipt(instance: InstanceDto, data: ManualReceiptDto) {
    return this.supermarketService.createManual(instance, data);
  }

  public async listReceipts(instance: InstanceDto, query: ReceiptQueryDto) {
    return this.supermarketService.listReceipts(instance, query);
  }

  public async getReceipt(instance: InstanceDto, receiptId: string) {
    return this.supermarketService.getReceipt(instance, receiptId);
  }

  public async deleteReceipt(instance: InstanceDto, receiptId: string) {
    return this.supermarketService.deleteReceipt(instance, receiptId);
  }

  public async analytics(instance: InstanceDto, query: AnalyticsQueryDto) {
    return this.supermarketService.analytics(instance, query);
  }

  /**
   * Hook invoked for every inbound WhatsApp message. When the message text
   * carries an NFC-e link/QR content, the receipt is captured automatically.
   * Non-receipt messages are ignored so other integrations are unaffected.
   */
  public async emit({ instance, remoteJid, msg }: SupermarketEmitData): Promise<void> {
    try {
      const text = this.extractText(msg);
      if (!text || !this.nfceService.isNfce(text)) return;

      const url = this.nfceService.extractUrl(text);
      const accessKey = this.nfceService.extractAccessKey(text);
      if (!url && !accessKey) return;

      this.logger.log(`NFC-e detected from ${remoteJid}, capturing receipt.`);

      await this.supermarketService.ingest(instance, {
        url: url ?? text,
        remoteJid,
      });
    } catch (error: any) {
      this.logger.error(`Supermarket auto-capture failed: ${error?.message}`);
    }
  }

  private extractText(msg: any): string | undefined {
    if (!msg) return undefined;
    const message = msg.message ?? msg;
    return (
      message?.conversation ||
      message?.extendedTextMessage?.text ||
      message?.imageMessage?.caption ||
      message?.documentMessage?.caption ||
      undefined
    );
  }
}

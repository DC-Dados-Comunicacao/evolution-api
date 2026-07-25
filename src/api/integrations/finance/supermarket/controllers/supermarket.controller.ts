import { InstanceDto } from '@api/dto/instance.dto';
import { Logger } from '@config/logger.config';

import {
  AnalyticsQueryDto,
  IngestReceiptDto,
  ManualReceiptDto,
  ReceiptQueryDto,
  SupermarketSettingDto,
} from '../dto/supermarket.dto';
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

  public async ingestReceipt(instance: InstanceDto, data: IngestReceiptDto) {
    return this.supermarketService.ingest(instance, data);
  }

  public async createManualReceipt(instance: InstanceDto, data: ManualReceiptDto) {
    return this.supermarketService.createManual(instance, data);
  }

  public async uploadReceipt(instance: InstanceDto, body: any, file: any) {
    return this.supermarketService.ingestFile(instance, file, body?.remoteJid, {
      apiKey: body?.openaiApiKey,
      model: body?.openaiModel,
    });
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

  public async getSettings(instance: InstanceDto) {
    return this.supermarketService.getSettings(instance);
  }

  public async setSettings(instance: InstanceDto, data: SupermarketSettingDto) {
    return this.supermarketService.setSettings(instance, data);
  }

  /**
   * Hook invoked for every inbound WhatsApp message. Delegates to the service,
   * which decides — based on the instance settings — whether to capture a
   * receipt from an NFC-e link or an image/PDF attachment. Non-receipt messages
   * and disabled instances are ignored so other integrations are unaffected.
   */
  public async emit({ instance, remoteJid, msg }: SupermarketEmitData): Promise<void> {
    try {
      await this.supermarketService.handleIncomingMessage(instance, remoteJid, msg);
    } catch (error: any) {
      this.logger.error(`Supermarket auto-capture failed: ${error?.message}`);
    }
  }
}

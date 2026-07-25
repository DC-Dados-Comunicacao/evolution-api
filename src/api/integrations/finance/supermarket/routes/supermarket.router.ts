import { RouterBroker } from '@api/abstract/abstract.router';
import { InstanceDto } from '@api/dto/instance.dto';
import { HttpStatus } from '@api/routes/index.router';
import { supermarketController } from '@api/server.module';
import { ROOT_DIR } from '@config/path.config';
import { instanceSchema } from '@validate/instance.schema';
import { RequestHandler, Router } from 'express';
import multer from 'multer';
import path from 'path';

import {
  AnalyticsQueryDto,
  IngestReceiptDto,
  ManualReceiptDto,
  ReceiptQueryDto,
  SupermarketSettingDto,
} from '../dto/supermarket.dto';
import { ingestReceiptSchema, manualReceiptSchema, supermarketSettingSchema } from '../validate/supermarket.schema';

// Receipts are held in memory and passed straight to the parser; 20 MB covers
// high-resolution photos and multi-page PDFs.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export class SupermarketRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      // Static dashboard page (no apikey guard: the browser loads the shell,
      // then fetches /analytics using the apikey the user types in the page).
      .get('/dashboard', (_req, res) => {
        res.sendFile(path.join(ROOT_DIR, 'public', 'supermarket', 'dashboard.html'));
      })
      .post(this.routerPath('upload'), ...guards, upload.single('file'), async (req, res) => {
        const bodyData = req.body;

        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: null,
          ClassRef: InstanceDto,
          execute: (instance) => supermarketController.uploadReceipt(instance, bodyData, req.file),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .post(this.routerPath('receipt'), ...guards, async (req, res) => {
        const response = await this.dataValidate<IngestReceiptDto>({
          request: req,
          schema: ingestReceiptSchema,
          ClassRef: IngestReceiptDto,
          execute: (instance, data) => supermarketController.ingestReceipt(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .post(this.routerPath('manual'), ...guards, async (req, res) => {
        const response = await this.dataValidate<ManualReceiptDto>({
          request: req,
          schema: manualReceiptSchema,
          ClassRef: ManualReceiptDto,
          execute: (instance, data) => supermarketController.createManualReceipt(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('receipts'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => supermarketController.listReceipts(instance, req.query as ReceiptQueryDto),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('analytics'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => supermarketController.analytics(instance, req.query as AnalyticsQueryDto),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('settings'), ...guards, async (req, res) => {
        const response = await this.dataValidate<SupermarketSettingDto>({
          request: req,
          schema: supermarketSettingSchema,
          ClassRef: SupermarketSettingDto,
          execute: (instance, data) => supermarketController.setSettings(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('settings'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => supermarketController.getSettings(instance),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('receipt/:receiptId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => supermarketController.getReceipt(instance, req.params.receiptId),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .delete(this.routerPath('receipt/:receiptId'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => supermarketController.deleteReceipt(instance, req.params.receiptId),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router: Router = Router();
}

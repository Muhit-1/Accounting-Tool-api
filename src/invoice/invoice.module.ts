import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BusinessModule } from '../business/business.module.js';
import { ClientModule } from '../client/client.module.js';
import { InvoiceController } from './invoice.controller.js';
import { InvoiceService } from './invoice.service.js';
import { InvoicePdfService } from './pdf/invoice-pdf.service.js';
import { InvoiceStorageService } from './pdf/invoice-storage.service.js';

@Module({
  imports: [AuthModule, BusinessModule, ClientModule],
  controllers: [InvoiceController],
  providers: [InvoiceService, InvoicePdfService, InvoiceStorageService],
})
export class InvoiceModule {}

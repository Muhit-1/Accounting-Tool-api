import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BusinessModule } from '../business/business.module.js';
import { InvoiceScanController } from './invoice-scan.controller.js';
import { InvoiceScanService } from './invoice-scan.service.js';

@Module({
  imports: [AuthModule, BusinessModule],
  controllers: [InvoiceScanController],
  providers: [InvoiceScanService],
})
export class InvoiceScanModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BusinessModule } from '../business/business.module.js';
import { TransactionController } from './transaction.controller.js';
import { TransactionService } from './transaction.service.js';
import { ReceiptStorageService } from './receipt-storage.service.js';

@Module({
  imports: [AuthModule, BusinessModule],
  controllers: [TransactionController],
  providers: [TransactionService, ReceiptStorageService],
})
export class TransactionModule {}

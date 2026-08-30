import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BusinessModule } from '../business/business.module.js';
import { LedgerController } from './ledger.controller.js';
import { LedgerService } from './ledger.service.js';

@Module({
  imports: [AuthModule, BusinessModule],
  controllers: [LedgerController],
  providers: [LedgerService],
})
export class LedgerModule {}

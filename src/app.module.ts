import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { EncryptionModule } from './encryption/encryption.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BusinessModule } from './business/business.module.js';
import { CategoryModule } from './category/category.module.js';
import { LedgerModule } from './ledger/ledger.module.js';
import { TransactionModule } from './transaction/transaction.module.js';
import { ClientModule } from './client/client.module.js';
import { InvoiceModule } from './invoice/invoice.module.js';
import { InvoiceScanModule } from './invoice-scan/invoice-scan.module.js';
import { ReportModule } from './report/report.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { AccessGrantModule } from './access-grant/access-grant.module.js';
import { RateLimitGuard } from './common/rate-limit.guard.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    EncryptionModule,
    AuthModule,
    BusinessModule,
    CategoryModule,
    LedgerModule,
    TransactionModule,
    ClientModule,
    InvoiceModule,
    InvoiceScanModule,
    ReportModule,
    DashboardModule,
    AccessGrantModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class AppModule {}

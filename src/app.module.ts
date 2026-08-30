import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BusinessModule } from './business/business.module.js';
import { CategoryModule } from './category/category.module.js';
import { LedgerModule } from './ledger/ledger.module.js';
import { TransactionModule } from './transaction/transaction.module.js';
import { ClientModule } from './client/client.module.js';
import { InvoiceModule } from './invoice/invoice.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { AccessGrantModule } from './access-grant/access-grant.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    BusinessModule,
    CategoryModule,
    LedgerModule,
    TransactionModule,
    ClientModule,
    InvoiceModule,
    DashboardModule,
    AccessGrantModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BusinessModule } from '../business/business.module.js';
import { ReportController } from './report.controller.js';
import { ReportService } from './report.service.js';
import { ReportPdfService } from './pdf/report-pdf.service.js';
import { StatementController } from './statement.controller.js';
import { FundStatementService } from './fund-statement.service.js';
import { MonthlyService } from './monthly.service.js';

@Module({
  imports: [AuthModule, BusinessModule],
  controllers: [ReportController, StatementController],
  providers: [ReportService, ReportPdfService, FundStatementService, MonthlyService],
})
export class ReportModule {}

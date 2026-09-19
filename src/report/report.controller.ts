import { Controller, Get, Param, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { contentDisposition } from '../common/content-disposition.js';
import { RateLimit } from '../common/rate-limit.guard.js';
import { ReportService } from './report.service.js';
import { ReportQueryDto } from './dto/report-query.dto.js';

const PDF_RATE_LIMIT = { limit: 15, windowMs: 60_000 };

@UseGuards(JwtAuthGuard)
@Controller()
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('reports')
  getCombined(@CurrentUser() user: AuthenticatedUser, @Query() query: ReportQueryDto) {
    return this.reportService.generateCombined(user.id, query);
  }

  @RateLimit(PDF_RATE_LIMIT)
  @Get('reports/pdf')
  async getCombinedPdf(@CurrentUser() user: AuthenticatedUser, @Query() query: ReportQueryDto) {
    const buffer = await this.reportService.generatePdfCombined(user.id, query);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: contentDisposition('attachment', `report-${query.from}-to-${query.to}.pdf`),
    });
  }

  @Get('businesses/:businessId/reports')
  getForBusiness(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Query() query: ReportQueryDto,
  ) {
    return this.reportService.generateForBusiness(user.id, businessId, query);
  }

  @RateLimit(PDF_RATE_LIMIT)
  @Get('businesses/:businessId/reports/pdf')
  async getForBusinessPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Query() query: ReportQueryDto,
  ) {
    const buffer = await this.reportService.generatePdfForBusiness(user.id, businessId, query);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: contentDisposition('attachment', `report-${query.from}-to-${query.to}.pdf`),
    });
  }
}

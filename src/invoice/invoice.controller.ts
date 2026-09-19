import { Body, Controller, Delete, Get, Param, Patch, Post, StreamableFile, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { contentDisposition } from '../common/content-disposition.js';
import { RateLimit } from '../common/rate-limit.guard.js';
import { InvoiceService } from './invoice.service.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import { UpdateInvoiceDto } from './dto/update-invoice.dto.js';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto.js';

// PDF rendering launches headless Chromium — far costlier than a normal request.
const PDF_RATE_LIMIT = { limit: 15, windowMs: 60_000 };

@UseGuards(JwtAuthGuard)
@Controller('businesses/:businessId/invoices')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.invoiceService.create(user.id, businessId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Param('businessId') businessId: string) {
    return this.invoiceService.findAllForBusiness(user.id, businessId);
  }

  // Must come before ':id' so "next-number" isn't parsed as an invoice id.
  @Get('next-number')
  previewNextNumber(@CurrentUser() user: AuthenticatedUser, @Param('businessId') businessId: string) {
    return this.invoiceService.previewNextNumber(user.id, businessId);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Param('id') id: string,
  ) {
    return this.invoiceService.findOneForBusiness(user.id, businessId, id);
  }

  @RateLimit(PDF_RATE_LIMIT)
  @Get(':id/pdf')
  async getPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Param('id') id: string,
  ) {
    const { buffer, filename } = await this.invoiceService.getPdf(user.id, businessId, id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: contentDisposition('attachment', filename),
    });
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoiceService.update(user.id, businessId, id, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceStatusDto,
  ) {
    return this.invoiceService.updateStatus(user.id, businessId, id, dto.status);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Param('id') id: string,
  ) {
    return this.invoiceService.remove(user.id, businessId, id);
  }
}

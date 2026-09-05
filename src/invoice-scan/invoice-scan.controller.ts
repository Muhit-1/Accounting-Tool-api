import { BadRequestException, Controller, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { InvoiceScanService } from './invoice-scan.service.js';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_BYTES = 8 * 1024 * 1024;

@UseGuards(JwtAuthGuard)
@Controller('businesses/:businessId/ledgers/:ledgerId/scan')
export class InvoiceScanController {
  constructor(private readonly invoiceScanService: InvoiceScanService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }))
  scan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Param('ledgerId') ledgerId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Please upload a JPG, PNG, or WEBP photo of the invoice');
    }
    return this.invoiceScanService.scan(user.id, businessId, ledgerId, file.buffer);
  }
}

import { BadRequestException, Controller, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { matchesFileSignature } from '../common/file-signature.js';
import { InvoiceScanService } from './invoice-scan.service.js';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_FILE_BYTES = 15 * 1024 * 1024;

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
      throw new BadRequestException('Please upload a PDF, JPG, PNG, or WEBP of the invoice');
    }
    // The declared mimetype is just a client-supplied header — verify the
    // actual file bytes match before trusting it any further.
    if (!matchesFileSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException("That file's contents don't match a PDF, JPG, PNG, or WEBP");
    }
    return this.invoiceScanService.scan(user.id, businessId, ledgerId, file.buffer, file.mimetype);
  }
}

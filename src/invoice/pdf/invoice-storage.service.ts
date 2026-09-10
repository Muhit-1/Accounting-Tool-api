import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isSafeId } from '../../common/safe-id.js';

// Stage 1: invoice PDFs live on local disk under INVOICE_STORAGE_DIR,
// one subfolder per business. Stage 2 replaces this with Google Drive,
// per the project plan — callers only depend on this service's interface.
@Injectable()
export class InvoiceStorageService {
  private readonly baseDir: string;

  constructor(configService: ConfigService) {
    this.baseDir = resolve(configService.get<string>('INVOICE_STORAGE_DIR') ?? './storage/invoices');
  }

  private pathFor(businessId: string, invoiceId: string): string {
    if (!isSafeId(businessId) || !isSafeId(invoiceId)) {
      // Callers only ever pass IDs that already passed a DB ownership
      // check, so this is a "this should be impossible" guard, not an
      // expected user-facing error.
      throw new InternalServerErrorException('Invalid identifier for file storage');
    }
    return join(this.baseDir, businessId, `${invoiceId}.pdf`);
  }

  async save(businessId: string, invoiceId: string, pdf: Buffer): Promise<string> {
    const filePath = this.pathFor(businessId, invoiceId);
    await mkdir(join(this.baseDir, businessId), { recursive: true });
    await writeFile(filePath, pdf);
    return filePath;
  }

  async read(filePath: string): Promise<Buffer> {
    return readFile(filePath);
  }

  async remove(filePath: string): Promise<void> {
    await rm(filePath, { force: true });
  }
}

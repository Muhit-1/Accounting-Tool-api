import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

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

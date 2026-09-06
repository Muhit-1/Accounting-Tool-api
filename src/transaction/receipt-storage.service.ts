import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// The invoice/receipt a user uploaded when creating a ledger entry via
// "Upload invoice" — kept on local disk (Stage 1, same pattern as
// InvoiceStorageService) so they can open it again later.
@Injectable()
export class ReceiptStorageService {
  private readonly baseDir: string;

  constructor(configService: ConfigService) {
    this.baseDir = resolve(configService.get<string>('RECEIPT_STORAGE_DIR') ?? './storage/receipts');
  }

  private pathFor(businessId: string, transactionId: string, mimeType: string): string {
    const extension = EXTENSION_BY_MIME_TYPE[mimeType] ?? 'bin';
    return join(this.baseDir, businessId, `${transactionId}.${extension}`);
  }

  async save(businessId: string, transactionId: string, mimeType: string, buffer: Buffer): Promise<string> {
    const filePath = this.pathFor(businessId, transactionId, mimeType);
    await mkdir(join(this.baseDir, businessId), { recursive: true });
    await writeFile(filePath, buffer);
    return filePath;
  }

  async read(filePath: string): Promise<Buffer> {
    return readFile(filePath);
  }

  async remove(filePath: string): Promise<void> {
    await rm(filePath, { force: true });
  }
}

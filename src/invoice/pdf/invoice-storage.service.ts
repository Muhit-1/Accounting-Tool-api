import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
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

  // Edits are saved in two steps so the database and the file can't disagree:
  // stage() writes the new PDF next to the real one, the caller then commits
  // the database change, and only then does commit() move it over the old
  // file (a same-directory rename, which is effectively atomic). If anything
  // fails before commit(), discard() leaves the old PDF untouched.
  async stage(businessId: string, invoiceId: string, pdf: Buffer): Promise<{ stagedPath: string; finalPath: string }> {
    const finalPath = this.pathFor(businessId, invoiceId);
    const stagedPath = `${finalPath}.${randomUUID()}.tmp`;
    await mkdir(join(this.baseDir, businessId), { recursive: true });
    await writeFile(stagedPath, pdf);
    return { stagedPath, finalPath };
  }

  async commit(staged: { stagedPath: string; finalPath: string }): Promise<void> {
    // Only ever promotes a file stage() created for this very path.
    if (!staged.stagedPath.startsWith(`${staged.finalPath}.`) || !staged.stagedPath.endsWith('.tmp')) {
      throw new InternalServerErrorException('Invalid staged file');
    }
    await rename(staged.stagedPath, staged.finalPath);
  }

  async discard(staged: { stagedPath: string }): Promise<void> {
    await rm(staged.stagedPath, { force: true });
  }

  async read(filePath: string): Promise<Buffer> {
    return readFile(filePath);
  }

  async remove(filePath: string): Promise<void> {
    await rm(filePath, { force: true });
  }
}

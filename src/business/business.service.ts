import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import { PrismaService } from '../prisma/prisma.service.js';
import { EncryptionService } from '../encryption/encryption.service.js';
import { AccessPermission, AccessScope, type Business } from '../generated/prisma/client.js';
import { CreateBusinessDto } from './dto/create-business.dto.js';
import { UpdateBusinessDto } from './dto/update-business.dto.js';

// These three are sensitive enough to encrypt at rest (see EncryptionService)
// — everything else on Business (name, address, contact info) is treated as
// ordinary business-profile data, not a secret.
const ENCRYPTED_FIELDS = ['bankAccountNumber', 'bankRoutingNumber', 'bankSwiftCode'] as const;

@Injectable()
export class BusinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  private encryptBankFields<T extends Partial<Record<(typeof ENCRYPTED_FIELDS)[number], string | null | undefined>>>(
    dto: T,
  ): T {
    const result = { ...dto };
    for (const field of ENCRYPTED_FIELDS) {
      if (field in dto) {
        result[field] = this.encryptionService.encrypt(dto[field]) as T[typeof field];
      }
    }
    return result;
  }

  private decryptBankFields<T extends Business>(business: T): T {
    return {
      ...business,
      bankAccountNumber: this.encryptionService.decrypt(business.bankAccountNumber),
      bankRoutingNumber: this.encryptionService.decrypt(business.bankRoutingNumber),
      bankSwiftCode: this.encryptionService.decrypt(business.bankSwiftCode),
    };
  }

  async create(ownerId: string, dto: CreateBusinessDto) {
    // Every venture starts with one account so its dashboard/account pages
    // aren't an empty dead-end before the user thinks to create one —
    // matches what existing ventures got backfilled with (see the
    // rename-ledger-to-account migration).
    const business = await this.prisma.business.create({
      data: { ownerId, ...this.encryptBankFields(dto), accounts: { create: { name: 'General account' } } },
    });
    return this.decryptBankFields(business);
  }

  async findAllForOwner(ownerId: string) {
    const businesses = await this.prisma.business.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'asc' },
    });
    return businesses.map((business) => this.decryptBankFields(business));
  }

  async findOneForOwner(ownerId: string, id: string) {
    const business = await this.prisma.business.findUnique({ where: { id } });
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    if (business.ownerId !== ownerId) {
      throw new ForbiddenException('You do not have access to this business');
    }
    return this.decryptBankFields(business);
  }

  async update(ownerId: string, id: string, dto: UpdateBusinessDto) {
    await this.findOneForOwner(ownerId, id);
    const updated = await this.prisma.business.update({ where: { id }, data: this.encryptBankFields(dto) });
    return this.decryptBankFields(updated);
  }

  async remove(ownerId: string, id: string) {
    await this.findOneForOwner(ownerId, id);

    // Invoices RESTRICT-delete their client (a client can't be removed
    // while it still has invoices — see ClientService.remove), so a plain
    // cascading business.delete() can hit that constraint if MySQL happens
    // to cascade the client before the invoice. Clear invoices and clients
    // explicitly, in that order, before cascading the rest of the business.
    const invoices = await this.prisma.invoice.findMany({
      where: { businessId: id },
      select: { fileReference: true },
    });
    await this.prisma.invoice.deleteMany({ where: { businessId: id } });
    await this.prisma.client.deleteMany({ where: { businessId: id } });
    await this.prisma.business.delete({ where: { id } });

    await Promise.all(
      invoices
        .filter((invoice) => invoice.fileReference)
        .map((invoice) => rm(invoice.fileReference!, { force: true }).catch(() => undefined)),
    );

    return { id };
  }

  // Used by the data modules nested under a business (categories,
  // transactions, clients, invoices, dashboard, reports) — unlike
  // findOneForOwner, this also allows a collaborator with an active,
  // non-expired AccessGrant for the whole business. Business CRUD itself
  // (above) stays owner-only. Callers that print bank details (e.g.
  // InvoiceService's PDF rendering) rely on getting decrypted values back
  // from here.
  async assertAccess(userId: string, businessId: string, permission: AccessPermission) {
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    if (business.ownerId === userId) {
      return this.decryptBankFields(business);
    }

    const grant = await this.prisma.accessGrant.findFirst({
      where: {
        businessId,
        granteeId: userId,
        scope: AccessScope.BUSINESS,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        ...(permission === AccessPermission.EDIT ? { permission: AccessPermission.EDIT } : {}),
      },
    });
    if (!grant) {
      throw new ForbiddenException('You do not have access to this business');
    }
    return this.decryptBankFields(business);
  }
}

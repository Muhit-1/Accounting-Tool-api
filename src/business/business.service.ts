import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessPermission, AccessScope } from '../generated/prisma/client.js';
import { CreateBusinessDto } from './dto/create-business.dto.js';
import { UpdateBusinessDto } from './dto/update-business.dto.js';

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

  create(ownerId: string, dto: CreateBusinessDto) {
    // Every venture starts with one ledger so its dashboard/ledger pages
    // aren't an empty dead-end before the user thinks to create one —
    // matches what existing ventures got backfilled with (see the
    // add-ledgers migration).
    return this.prisma.business.create({
      data: { ownerId, ...dto, ledgers: { create: { name: 'General ledger' } } },
    });
  }

  findAllForOwner(ownerId: string) {
    return this.prisma.business.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOneForOwner(ownerId: string, id: string) {
    const business = await this.prisma.business.findUnique({ where: { id } });
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    if (business.ownerId !== ownerId) {
      throw new ForbiddenException('You do not have access to this business');
    }
    return business;
  }

  async update(ownerId: string, id: string, dto: UpdateBusinessDto) {
    await this.findOneForOwner(ownerId, id);
    return this.prisma.business.update({ where: { id }, data: dto });
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
  // transactions, clients, invoices, dashboard) — unlike findOneForOwner,
  // this also allows a collaborator with an active, non-expired AccessGrant
  // for the whole business. Business CRUD itself (above) stays owner-only.
  async assertAccess(userId: string, businessId: string, permission: AccessPermission) {
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    if (business.ownerId === userId) {
      return business;
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
    return business;
  }
}

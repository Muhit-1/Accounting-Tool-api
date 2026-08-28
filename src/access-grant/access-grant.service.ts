import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessService } from '../business/business.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessScope } from '../generated/prisma/client.js';
import { CreateAccessGrantDto } from './dto/create-access-grant.dto.js';

const GRANTEE_SELECT = { id: true, email: true, name: true } as const;

@Injectable()
export class AccessGrantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessService: BusinessService,
  ) {}

  async create(ownerId: string, businessId: string, dto: CreateAccessGrantDto) {
    await this.businessService.findOneForOwner(ownerId, businessId);

    const grantee = await this.prisma.user.findUnique({ where: { email: dto.granteeEmail } });
    if (!grantee) {
      throw new NotFoundException('No registered user found with that email');
    }
    if (grantee.id === ownerId) {
      throw new BadRequestException('You cannot grant access to yourself');
    }

    const expiresAt = new Date(dto.expiresAt);
    if (expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('expiresAt must be in the future');
    }

    return this.prisma.accessGrant.create({
      data: {
        businessId,
        granteeId: grantee.id,
        scope: dto.scope,
        tableName: dto.tableName,
        permission: dto.permission,
        expiresAt,
      },
      include: { grantee: { select: GRANTEE_SELECT } },
    });
  }

  async findAllForBusiness(ownerId: string, businessId: string) {
    await this.businessService.findOneForOwner(ownerId, businessId);
    const grants = await this.prisma.accessGrant.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      include: { grantee: { select: GRANTEE_SELECT } },
    });
    const now = Date.now();
    return grants.map((grant) => ({
      ...grant,
      status: grant.revokedAt ? 'revoked' : grant.expiresAt.getTime() <= now ? 'expired' : 'active',
    }));
  }

  async revoke(ownerId: string, businessId: string, id: string) {
    await this.businessService.findOneForOwner(ownerId, businessId);
    const grant = await this.prisma.accessGrant.findUnique({ where: { id } });
    if (!grant) {
      throw new NotFoundException('Access grant not found');
    }
    if (grant.businessId !== businessId) {
      throw new ForbiddenException('This access grant does not belong to that business');
    }
    return this.prisma.accessGrant.update({
      where: { id },
      data: { revokedAt: grant.revokedAt ?? new Date() },
    });
  }

  async findSharedWithMe(userId: string) {
    const grants = await this.prisma.accessGrant.findMany({
      where: {
        granteeId: userId,
        scope: AccessScope.BUSINESS,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { business: { select: { id: true, name: true, currency: true } } },
    });
    return grants.map((grant) => ({
      business: grant.business,
      permission: grant.permission,
      expiresAt: grant.expiresAt,
    }));
  }
}

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccessGrantService } from './access-grant.service.js';
import { AccessPermission, AccessScope } from '../generated/prisma/client.js';

function createPrismaMock() {
  return {
    user: { findUnique: vi.fn() },
    accessGrant: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  };
}

function createBusinessServiceMock() {
  return { findOneForOwner: vi.fn().mockResolvedValue({ id: 'biz1', ownerId: 'owner1' }) };
}

describe('AccessGrantService.create', () => {
  let service: AccessGrantService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let businessService: ReturnType<typeof createBusinessServiceMock>;

  const futureDate = new Date(Date.now() + 86_400_000).toISOString();

  beforeEach(() => {
    prisma = createPrismaMock();
    businessService = createBusinessServiceMock();
    service = new AccessGrantService(prisma as never, businessService as never);
  });

  it('throws NotFoundException when the grantee email is not a registered user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.create('owner1', 'biz1', {
        granteeEmail: 'nobody@x.com',
        scope: AccessScope.BUSINESS,
        permission: AccessPermission.VIEW,
        expiresAt: futureDate,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when granting access to yourself', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'owner1', email: 'owner1@x.com' });

    await expect(
      service.create('owner1', 'biz1', {
        granteeEmail: 'owner1@x.com',
        scope: AccessScope.BUSINESS,
        permission: AccessPermission.VIEW,
        expiresAt: futureDate,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when expiresAt is in the past', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'grantee1', email: 'grantee@x.com' });

    await expect(
      service.create('owner1', 'biz1', {
        granteeEmail: 'grantee@x.com',
        scope: AccessScope.BUSINESS,
        permission: AccessPermission.VIEW,
        expiresAt: '2020-01-01T00:00:00.000Z',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates a grant when the grantee is valid, distinct from the owner, and expiresAt is in the future', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'grantee1', email: 'grantee@x.com' });
    prisma.accessGrant.create.mockResolvedValue({ id: 'g1' });

    const result = await service.create('owner1', 'biz1', {
      granteeEmail: 'grantee@x.com',
      scope: AccessScope.BUSINESS,
      permission: AccessPermission.VIEW,
      expiresAt: futureDate,
    });

    expect(result).toEqual({ id: 'g1' });
    expect(prisma.accessGrant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ businessId: 'biz1', granteeId: 'grantee1' }),
      }),
    );
  });
});

describe('AccessGrantService.findAllForBusiness', () => {
  it('labels grants as active, expired, or revoked', async () => {
    const prisma = createPrismaMock();
    const businessService = createBusinessServiceMock();
    const service = new AccessGrantService(prisma as never, businessService as never);

    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);

    prisma.accessGrant.findMany.mockResolvedValue([
      { id: 'active', expiresAt: future, revokedAt: null },
      { id: 'expired', expiresAt: past, revokedAt: null },
      { id: 'revoked', expiresAt: future, revokedAt: past },
    ]);

    const result = await service.findAllForBusiness('owner1', 'biz1');

    expect(result.map((g) => g.status)).toEqual(['active', 'expired', 'revoked']);
  });
});

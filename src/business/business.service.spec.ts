import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { BusinessService } from './business.service.js';
import { AccessPermission, AccessScope } from '../generated/prisma/client.js';

function createPrismaMock() {
  return {
    business: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    accessGrant: { findFirst: vi.fn() },
  };
}

describe('BusinessService.assertAccess', () => {
  let service: BusinessService;
  let prisma: ReturnType<typeof createPrismaMock>;

  const business = { id: 'biz1', ownerId: 'owner1', name: 'Test Co' };

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new BusinessService(prisma as never);
  });

  it('allows the owner full access without checking grants at all', async () => {
    prisma.business.findUnique.mockResolvedValue(business);

    const result = await service.assertAccess('owner1', 'biz1', AccessPermission.EDIT);

    expect(result).toBe(business);
    expect(prisma.accessGrant.findFirst).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the business does not exist', async () => {
    prisma.business.findUnique.mockResolvedValue(null);

    await expect(service.assertAccess('user1', 'biz1', AccessPermission.VIEW)).rejects.toThrow(NotFoundException);
  });

  it('allows a non-owner with an active VIEW grant to view', async () => {
    prisma.business.findUnique.mockResolvedValue(business);
    prisma.accessGrant.findFirst.mockResolvedValue({ id: 'g1', permission: AccessPermission.VIEW });

    const result = await service.assertAccess('grantee1', 'biz1', AccessPermission.VIEW);

    expect(result).toBe(business);
  });

  it('rejects a VIEW-only grantee attempting an EDIT action', async () => {
    prisma.business.findUnique.mockResolvedValue(business);
    // The EDIT-permission query filter finds nothing for a VIEW-only grant.
    prisma.accessGrant.findFirst.mockResolvedValue(null);

    await expect(service.assertAccess('grantee1', 'biz1', AccessPermission.EDIT)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects a stranger with no grant at all', async () => {
    prisma.business.findUnique.mockResolvedValue(business);
    prisma.accessGrant.findFirst.mockResolvedValue(null);

    await expect(service.assertAccess('stranger1', 'biz1', AccessPermission.VIEW)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('queries only active, non-expired, non-revoked BUSINESS-scope grants for this business and user', async () => {
    prisma.business.findUnique.mockResolvedValue(business);
    prisma.accessGrant.findFirst.mockResolvedValue({ id: 'g1' });

    await service.assertAccess('grantee1', 'biz1', AccessPermission.VIEW);

    expect(prisma.accessGrant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: 'biz1',
          granteeId: 'grantee1',
          scope: AccessScope.BUSINESS,
          revokedAt: null,
        }),
      }),
    );
  });

  it('does not restrict by grant permission when only VIEW is required (EDIT grants imply VIEW)', async () => {
    prisma.business.findUnique.mockResolvedValue(business);
    prisma.accessGrant.findFirst.mockResolvedValue({ id: 'g1' });

    await service.assertAccess('grantee1', 'biz1', AccessPermission.VIEW);

    const where = prisma.accessGrant.findFirst.mock.calls[0][0].where;
    expect(where.permission).toBeUndefined();
  });
});

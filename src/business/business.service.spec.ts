import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { BusinessService } from './business.service.js';
import { AccessPermission, AccessScope } from '../generated/prisma/client.js';

function createPrismaMock() {
  return {
    business: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    accessGrant: { findFirst: vi.fn() },
  };
}

// Passthrough — these tests aren't exercising encryption itself (see
// encryption.service.spec.ts for that), just that assertAccess still
// returns the business it looked up.
function createEncryptionServiceMock() {
  return {
    encrypt: vi.fn((value: string | null | undefined) => value ?? null),
    decrypt: vi.fn((value: string | null | undefined) => value ?? null),
  };
}

describe('BusinessService.assertAccess', () => {
  let service: BusinessService;
  let prisma: ReturnType<typeof createPrismaMock>;

  const business = { id: 'biz1', ownerId: 'owner1', name: 'Test Co' };

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new BusinessService(prisma as never, createEncryptionServiceMock() as never);
  });

  it('allows the owner full access without checking grants at all', async () => {
    prisma.business.findUnique.mockResolvedValue(business);

    const result = await service.assertAccess('owner1', 'biz1', AccessPermission.EDIT);

    expect(result).toMatchObject(business);
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

    expect(result).toMatchObject(business);
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

describe('BusinessService.findOneForViewer', () => {
  let service: BusinessService;
  let prisma: ReturnType<typeof createPrismaMock>;

  const business = {
    id: 'biz1',
    ownerId: 'owner1',
    name: 'Test Co',
    bankAccountName: 'Test Co Ltd',
    bankBranch: 'Main branch',
    bankAccountNumber: '1234567890',
    bankRoutingNumber: '987654321',
    bankSwiftCode: 'TESTBDDH',
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new BusinessService(prisma as never, createEncryptionServiceMock() as never);
    prisma.business.findUnique.mockResolvedValue(business);
  });

  it('gives the owner the decrypted bank numbers', async () => {
    const result = await service.findOneForViewer('owner1', 'biz1');

    expect(result).toMatchObject({
      bankAccountNumber: '1234567890',
      bankRoutingNumber: '987654321',
      bankSwiftCode: 'TESTBDDH',
    });
  });

  it('withholds the bank numbers from a VIEW collaborator but keeps the response shape', async () => {
    prisma.accessGrant.findFirst.mockResolvedValue({ id: 'g1', permission: AccessPermission.VIEW });

    const result = await service.findOneForViewer('grantee1', 'biz1');

    expect(result).toMatchObject({
      id: 'biz1',
      name: 'Test Co',
      bankAccountNumber: null,
      bankRoutingNumber: null,
      bankSwiftCode: null,
    });
    expect(JSON.stringify(result)).not.toContain('1234567890');
    expect(JSON.stringify(result)).not.toContain('TESTBDDH');
  });

  it('withholds them from an EDIT collaborator too', async () => {
    prisma.accessGrant.findFirst.mockResolvedValue({ id: 'g2', permission: AccessPermission.EDIT });

    const result = await service.findOneForViewer('grantee2', 'biz1');

    expect(result.bankAccountNumber).toBeNull();
  });

  it('still rejects a stranger', async () => {
    prisma.accessGrant.findFirst.mockResolvedValue(null);

    await expect(service.findOneForViewer('stranger1', 'biz1')).rejects.toThrow(ForbiddenException);
  });

  it('does not change what assertAccess returns (the invoice PDF needs the decrypted numbers)', async () => {
    prisma.accessGrant.findFirst.mockResolvedValue({ id: 'g1' });

    const result = await service.assertAccess('grantee1', 'biz1', AccessPermission.VIEW);

    expect(result.bankAccountNumber).toBe('1234567890');
  });
});

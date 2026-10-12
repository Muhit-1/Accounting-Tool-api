import { ConflictException } from '@nestjs/common';
import { AccountService } from './account.service.js';

function setup(entryCount: number, orderCount = 0) {
  const prisma = {
    account: {
      findUnique: vi.fn().mockResolvedValue({ id: 'acc1', businessId: 'biz1', name: 'Cash' }),
      delete: vi.fn(),
    },
    transaction: { count: vi.fn().mockResolvedValue(entryCount) },
    order: { count: vi.fn().mockResolvedValue(orderCount) },
  };
  const businessService = { assertAccess: vi.fn().mockResolvedValue({ id: 'biz1' }) };
  return { service: new AccountService(prisma as never, businessService as never), prisma };
}

describe('AccountService.remove', () => {
  it('refuses to delete an account that still has entries, so nothing cascades or is orphaned', async () => {
    const { service, prisma } = setup(3);

    await expect(service.remove('user1', 'biz1', 'acc1')).rejects.toThrow(ConflictException);
    await expect(service.remove('user1', 'biz1', 'acc1')).rejects.toThrow(/3 entries/);

    expect(prisma.account.delete).not.toHaveBeenCalled();
  });

  it('deletes an empty account', async () => {
    const { service, prisma } = setup(0);

    await expect(service.remove('user1', 'biz1', 'acc1')).resolves.toEqual({ id: 'acc1' });

    expect(prisma.account.delete).toHaveBeenCalledWith({ where: { id: 'acc1' } });
  });

  it('refuses to delete an account that is the fund of orders (they would be left without one)', async () => {
    const { service, prisma } = setup(0, 2);

    await expect(service.remove('user1', 'biz1', 'acc1')).rejects.toThrow(ConflictException);
    await expect(service.remove('user1', 'biz1', 'acc1')).rejects.toThrow(/2 orders/);

    expect(prisma.account.delete).not.toHaveBeenCalled();
  });
});

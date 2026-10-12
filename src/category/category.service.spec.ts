import { ConflictException, ForbiddenException } from '@nestjs/common';
import { CategoryService, categoryResponse } from './category.service.js';
import { CategoryType } from '../generated/prisma/client.js';

function setup(category: object | null) {
  const prisma = {
    category: {
      findUnique: vi.fn().mockResolvedValue(category),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const businessService = { assertAccess: vi.fn().mockResolvedValue({ id: 'biz1' }) };
  return { prisma, service: new CategoryService(prisma as never, businessService as never) };
}

const manual = { id: 'c1', businessId: 'biz1', name: 'Rent', type: CategoryType.EXPENSE, groupName: null, systemKey: null };
const system = { ...manual, id: 'c2', name: 'Orders (auto)', type: CategoryType.INCOME, systemKey: 'ORDERS_IN' };

describe('categoryResponse', () => {
  it('hides the system key and says whether the category is locked', () => {
    expect(categoryResponse(system)).toMatchObject({ id: 'c2', isSystem: true });
    expect(categoryResponse(system)).not.toHaveProperty('systemKey');
    expect(categoryResponse(manual).isSystem).toBe(false);
  });
});

describe('CategoryService system categories', () => {
  it('cannot be renamed or deleted by hand', async () => {
    const { service, prisma } = setup(system);
    await expect(service.update('u1', 'biz1', 'c2', { name: 'Mine' })).rejects.toThrow(ConflictException);
    await expect(service.remove('u1', 'biz1', 'c2')).rejects.toThrow(ConflictException);
    expect(prisma.category.update).not.toHaveBeenCalled();
    expect(prisma.category.delete).not.toHaveBeenCalled();
  });

  it('a normal category can be renamed and deleted', async () => {
    const { service, prisma } = setup(manual);
    prisma.category.update.mockResolvedValue({ ...manual, name: 'Office rent' });
    expect(await service.update('u1', 'biz1', 'c1', { name: 'Office rent' })).toMatchObject({ name: 'Office rent', isSystem: false });
    await service.remove('u1', 'biz1', 'c1');
    expect(prisma.category.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('refuses a category of another business', async () => {
    const { service } = setup({ ...manual, businessId: 'other' });
    await expect(service.update('u1', 'biz1', 'c1', { name: 'x' })).rejects.toThrow(ForbiddenException);
  });

  it('lists categories with the isSystem flag', async () => {
    const { service, prisma } = setup(null);
    prisma.category.findMany.mockResolvedValue([manual, system]);
    const list = await service.findAllForBusiness('u1', 'biz1');
    expect(list.map((c) => c.isSystem)).toEqual([false, true]);
  });
});

import { BadRequestException } from '@nestjs/common';
import { TransactionService } from './transaction.service.js';
import { CategoryType, LineDirection } from '../generated/prisma/client.js';

function createPrismaMock() {
  return {
    transaction: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    category: { findUnique: vi.fn() },
    account: { findUnique: vi.fn().mockResolvedValue({ id: 'account1', businessId: 'biz1' }) },
    line: { findMany: vi.fn() },
  };
}

function createBusinessServiceMock() {
  return { assertAccess: vi.fn().mockResolvedValue({ id: 'biz1' }) };
}

function createReceiptStorageMock() {
  return { save: vi.fn(), read: vi.fn(), remove: vi.fn() };
}

describe('TransactionService', () => {
  let service: TransactionService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let businessService: ReturnType<typeof createBusinessServiceMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    businessService = createBusinessServiceMock();
    service = new TransactionService(prisma as never, businessService as never, createReceiptStorageMock() as never);
  });

  describe('create', () => {
    it('rejects a category whose type does not match the transaction type', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 'cat1',
        businessId: 'biz1',
        type: CategoryType.EXPENSE,
        name: 'Rent',
      });

      await expect(
        service.create('user1', 'biz1', {
          accountId: 'account1',
          date: '2026-01-01',
          amount: 10,
          type: CategoryType.INCOME,
          categoryId: 'cat1',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it('rejects a category that belongs to a different business', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 'cat1',
        businessId: 'some-other-business',
        type: CategoryType.INCOME,
        name: 'Sales',
      });

      await expect(
        service.create('user1', 'biz1', {
          accountId: 'account1',
          date: '2026-01-01',
          amount: 10,
          type: CategoryType.INCOME,
          categoryId: 'cat1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('stores an INCOME transaction as a CREDIT line and an EXPENSE transaction as a DEBIT line', async () => {
      prisma.transaction.create.mockResolvedValue({
        id: 'tx1',
        date: new Date('2026-01-01'),
        memo: null,
        createdAt: new Date(),
        lines: [{ amount: 100, direction: LineDirection.CREDIT, categoryId: null, category: null }],
      });

      await service.create('user1', 'biz1', {
        accountId: 'account1',
        date: '2026-01-01',
        amount: 100,
        type: CategoryType.INCOME,
      });

      const createArgs = prisma.transaction.create.mock.calls[0][0];
      expect(createArgs.data.lines.create.direction).toBe(LineDirection.CREDIT);
    });
  });

  describe('findAllForBusiness', () => {
    it('computes an accumulating running balance in date order', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        {
          id: 'tx1',
          date: new Date('2026-01-01'),
          memo: null,
          createdAt: new Date(),
          lines: [{ amount: 100, direction: LineDirection.CREDIT, categoryId: null, category: null }],
        },
        {
          id: 'tx2',
          date: new Date('2026-01-02'),
          memo: null,
          createdAt: new Date(),
          lines: [{ amount: 30, direction: LineDirection.DEBIT, categoryId: null, category: null }],
        },
        {
          id: 'tx3',
          date: new Date('2026-01-03'),
          memo: null,
          createdAt: new Date(),
          lines: [{ amount: 50, direction: LineDirection.CREDIT, categoryId: null, category: null }],
        },
      ]);

      const result = await service.findAllForBusiness('user1', 'biz1');

      expect(result.map((r) => r.runningBalance)).toEqual([100, 70, 120]);
    });
  });
});

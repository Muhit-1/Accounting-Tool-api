import { BadRequestException } from '@nestjs/common';
import { TransactionService } from './transaction.service.js';
import { CategoryType, LineDirection, Prisma } from '../generated/prisma/client.js';

function createPrismaMock() {
  return {
    transaction: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    category: { findUnique: vi.fn() },
    account: { findUnique: vi.fn().mockResolvedValue({ id: 'account1', businessId: 'biz1' }) },
    line: { findMany: vi.fn() },
  };
}

const base = { accountId: 'account1', date: '2026-01-01', type: CategoryType.EXPENSE };

function row(extra: Record<string, unknown> = {}) {
  return {
    id: 'tx1',
    accountId: 'account1',
    date: new Date('2026-01-01'),
    memo: null,
    counterparty: null,
    receiptFileName: null,
    createdAt: new Date(),
    lines: [{ amount: 5000, direction: LineDirection.DEBIT, categoryId: null, category: null }],
    ...extra,
  };
}

describe('TransactionService amount types', () => {
  let service: TransactionService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    const businessService = { assertAccess: vi.fn().mockResolvedValue({ id: 'biz1' }) };
    const receiptStorage = { save: vi.fn(), read: vi.fn(), remove: vi.fn() };
    service = new TransactionService(prisma as never, businessService as never, receiptStorage as never);
  });

  describe('create', () => {
    it('saves the SERVER amount for MULTIPLY even when the client sends a different one', async () => {
      prisma.transaction.create.mockResolvedValue(row());

      await service.create('user1', 'biz1', { ...base, amount: 1, amountType: 'MULTIPLY', amountInputs: [1000, 5] });

      const data = prisma.transaction.create.mock.calls[0][0].data;
      expect(data.lines.create.amount).toBe(5000);
      expect(data.amountType).toBe('MULTIPLY');
      expect(data.amountInputs).toEqual([1000, 5]);
    });

    it('does not need an amount at all for a calculated type', async () => {
      prisma.transaction.create.mockResolvedValue(row());

      await service.create('user1', 'biz1', { ...base, amountType: 'SPLIT', amountInputs: [9000, 3] });

      expect(prisma.transaction.create.mock.calls[0][0].data.lines.create.amount).toBe(3000);
    });

    it('FIXED behaves as before: the client amount is saved, no type or boxes are stored', async () => {
      prisma.transaction.create.mockResolvedValue(row());

      await service.create('user1', 'biz1', { ...base, amount: 123.45, amountType: 'FIXED', amountInputs: [9, 9] });

      const data = prisma.transaction.create.mock.calls[0][0].data;
      expect(data.lines.create.amount).toBe(123.45);
      expect(data.amountType).toBeUndefined();
      expect(data.amountInputs).toBeUndefined();
    });

    it('a request with no amountType at all is a plain fixed entry', async () => {
      prisma.transaction.create.mockResolvedValue(row());

      await service.create('user1', 'biz1', { ...base, amount: 75 });

      const data = prisma.transaction.create.mock.calls[0][0].data;
      expect(data.lines.create.amount).toBe(75);
      expect(data.amountType).toBeUndefined();
    });

    it('rejects a plain entry that has no amount', async () => {
      await expect(service.create('user1', 'biz1', { ...base })).rejects.toThrow(BadRequestException);
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it('turns a calc failure into a 400 with the plain message', async () => {
      await expect(
        service.create('user1', 'biz1', { ...base, amountType: 'SPLIT', amountInputs: [100, 0] }),
      ).rejects.toThrow("Number of people can't be 0.");
      await expect(service.create('user1', 'biz1', { ...base, amountType: 'MULTIPLY' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it('returns amountType, amountInputs and proofUrl in the response', async () => {
      prisma.transaction.create.mockResolvedValue(
        row({ amountType: 'MULTIPLY', amountInputs: [1000, 5], proofUrl: 'https://example.com/p.png' }),
      );

      const result = await service.create('user1', 'biz1', {
        ...base,
        amountType: 'MULTIPLY',
        amountInputs: [1000, 5],
        proofUrl: 'https://example.com/p.png',
      });

      expect(result.amountType).toBe('MULTIPLY');
      expect(result.amountInputs).toEqual([1000, 5]);
      expect(result.proofUrl).toBe('https://example.com/p.png');
      expect(result.amount).toBe(5000);
      expect(prisma.transaction.create.mock.calls[0][0].data.proofUrl).toBe('https://example.com/p.png');
    });
  });

  describe('reading', () => {
    it('old rows (null type, null boxes, no proof) still read fine', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        row({ amountType: null, amountInputs: null, proofUrl: null }),
        row({ id: 'tx0' }), // as if the new columns did not exist yet
      ]);

      const result = await service.findAllForBusiness('user1', 'biz1');

      expect(result).toHaveLength(2);
      for (const entry of result) {
        expect(entry.amountType).toBeNull();
        expect(entry.amountInputs).toBeNull();
        expect(entry.proofUrl).toBeNull();
        expect(entry.amount).toBe(5000);
      }
    });

    it('treats a damaged amountInputs value as "no boxes"', async () => {
      prisma.transaction.findMany.mockResolvedValue([row({ amountType: 'SUM', amountInputs: 'oops' })]);

      const [entry] = await service.findAllForBusiness('user1', 'biz1');

      expect(entry.amountInputs).toBeNull();
    });
  });

  describe('update', () => {
    function existing(extra: Record<string, unknown> = {}) {
      return {
        id: 'tx1',
        businessId: 'biz1',
        date: new Date('2026-01-01'),
        amountType: 'MULTIPLY',
        amountInputs: [1000, 5],
        lines: [{ id: 'line1', amount: 5000, direction: LineDirection.DEBIT, categoryId: null }],
        ...extra,
      };
    }

    beforeEach(() => {
      prisma.transaction.update.mockResolvedValue(row());
    });

    it('switching back to FIXED clears the type and the boxes and keeps the typed amount', async () => {
      prisma.transaction.findUnique.mockResolvedValue(existing());

      await service.update('user1', 'biz1', 'tx1', { amountType: 'FIXED', amount: 4800 });

      const data = prisma.transaction.update.mock.calls[0][0].data;
      expect(data.amountType).toBeNull();
      expect(data.amountInputs).toBe(Prisma.DbNull);
      expect(data.lines.update.data.amount).toBe(4800);
    });

    it('switching to FIXED without a new amount leaves the amount as it was', async () => {
      prisma.transaction.findUnique.mockResolvedValue(existing());

      await service.update('user1', 'biz1', 'tx1', { amountType: 'FIXED' });

      const data = prisma.transaction.update.mock.calls[0][0].data;
      expect(data.amountInputs).toBe(Prisma.DbNull);
      expect(data.lines.update.data.amount).toBeUndefined();
    });

    it('recomputes on the server when the boxes change and ignores a client amount', async () => {
      prisma.transaction.findUnique.mockResolvedValue(existing());

      await service.update('user1', 'biz1', 'tx1', { amount: 1, amountType: 'MULTIPLY', amountInputs: [1200, 5] });

      const data = prisma.transaction.update.mock.calls[0][0].data;
      expect(data.lines.update.data.amount).toBe(6000);
      expect(data.amountInputs).toEqual([1200, 5]);
    });

    it('changing a plain entry to a calculated type stores the type', async () => {
      prisma.transaction.findUnique.mockResolvedValue(existing({ amountType: null, amountInputs: null }));

      await service.update('user1', 'biz1', 'tx1', { amountType: 'PERCENT', amountInputs: [5, 20000] });

      const data = prisma.transaction.update.mock.calls[0][0].data;
      expect(data.amountType).toBe('PERCENT');
      expect(data.lines.update.data.amount).toBe(1000);
    });

    it('an old client sending only a new amount for a calculated entry makes it a plain amount', async () => {
      prisma.transaction.findUnique.mockResolvedValue(existing());

      await service.update('user1', 'biz1', 'tx1', { amount: 300 });

      const data = prisma.transaction.update.mock.calls[0][0].data;
      expect(data.amountType).toBeNull();
      expect(data.amountInputs).toBe(Prisma.DbNull);
      expect(data.lines.update.data.amount).toBe(300);
    });

    it('editing only the memo leaves type, boxes and amount alone', async () => {
      prisma.transaction.findUnique.mockResolvedValue(existing());

      await service.update('user1', 'biz1', 'tx1', { memo: 'new note' });

      const data = prisma.transaction.update.mock.calls[0][0].data;
      expect(data.memo).toBe('new note');
      expect(data.amountType).toBeUndefined();
      expect(data.amountInputs).toBeUndefined();
      expect(data.lines.update.data.amount).toBeUndefined();
    });

    it('rejects boxes for an entry that has no calculated type', async () => {
      prisma.transaction.findUnique.mockResolvedValue(existing({ amountType: null, amountInputs: null }));

      await expect(service.update('user1', 'biz1', 'tx1', { amountInputs: [1, 2] })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it('an old plain entry can still be edited and saved', async () => {
      prisma.transaction.findUnique.mockResolvedValue(existing({ amountType: null, amountInputs: null }));

      await service.update('user1', 'biz1', 'tx1', { amount: 80, memo: 'x' });

      const data = prisma.transaction.update.mock.calls[0][0].data;
      expect(data.lines.update.data.amount).toBe(80);
      expect(data.amountType).toBeUndefined();
    });

    it('saves and clears the proof link', async () => {
      prisma.transaction.findUnique.mockResolvedValue(existing());

      await service.update('user1', 'biz1', 'tx1', { proofUrl: 'https://example.com/r.png' });
      expect(prisma.transaction.update.mock.calls[0][0].data.proofUrl).toBe('https://example.com/r.png');

      await service.update('user1', 'biz1', 'tx1', { proofUrl: null });
      expect(prisma.transaction.update.mock.calls[1][0].data.proofUrl).toBeNull();
    });
  });
});

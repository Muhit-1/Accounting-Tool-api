import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TransactionService } from './transaction.service.js';
import { BulkCreateTransactionsDto } from './dto/bulk-transactions.dto.js';
import { AccessPermission, CategoryType, LineDirection } from '../generated/prisma/client.js';

const INCOME_CAT = { id: 'catIn', name: 'Sales', type: CategoryType.INCOME };
const EXPENSE_CAT = { id: 'catOut', name: 'Rent', type: CategoryType.EXPENSE };

function setup() {
  const prisma = {
    category: { findMany: vi.fn().mockResolvedValue([INCOME_CAT, EXPENSE_CAT]) },
    account: { findUnique: vi.fn().mockResolvedValue({ id: 'acc1', businessId: 'biz1' }) },
    transaction: { createMany: vi.fn().mockResolvedValue({ count: 0 }), findMany: vi.fn(), deleteMany: vi.fn() },
    line: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (db: typeof prisma) => Promise<unknown>) => fn(prisma));
  const businessService = { assertAccess: vi.fn().mockResolvedValue({ id: 'biz1' }) };
  const receiptStorage = { save: vi.fn(), read: vi.fn(), remove: vi.fn().mockResolvedValue(undefined) };
  const service = new TransactionService(prisma as never, businessService as never, receiptStorage as never);
  return { service, prisma, businessService, receiptStorage };
}

const income = (extra: object = {}) => ({ date: '2026-05-11', type: 'INCOME', amount: 5000, categoryId: 'catIn', memo: 'Payment', ...extra });
const expense = (extra: object = {}) => ({ date: '2026-05-12', type: 'EXPENSE', amount: 4214.5, categoryId: 'catOut', ...extra });

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    return err as BadRequestException;
  }
  throw new Error('expected the call to fail');
}

describe('TransactionService.bulkCreate', () => {
  it('checks edit access first, and the account belongs to the business', async () => {
    const { service, businessService, prisma } = setup();
    businessService.assertAccess.mockRejectedValue(new ForbiddenException());
    await expect(service.bulkCreate('u1', 'biz1', 'acc1', { rows: [income()] })).rejects.toThrow(ForbiddenException);
    expect(businessService.assertAccess).toHaveBeenCalledWith('u1', 'biz1', AccessPermission.EDIT);
    expect(prisma.transaction.createMany).not.toHaveBeenCalled();

    const other = setup();
    other.prisma.account.findUnique.mockResolvedValue({ id: 'acc1', businessId: 'someone-else' });
    await expect(other.service.bulkCreate('u1', 'biz1', 'acc1', { rows: [income()] })).rejects.toThrow(BadRequestException);
    expect(other.prisma.transaction.createMany).not.toHaveBeenCalled();
  });

  it('creates every row in one database transaction: money in as CREDIT, money out as DEBIT', async () => {
    const { service, prisma } = setup();
    const result = await service.bulkCreate('u1', 'biz1', 'acc1', { importBatchId: 'batch-1', rows: [income(), expense(), income({ amount: 0.1 }), income({ amount: 0.2 })] });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const txData = prisma.transaction.createMany.mock.calls[0][0].data;
    const lineData = prisma.line.createMany.mock.calls[0][0].data;
    expect(txData).toHaveLength(4);
    expect(txData.every((t: { importBatchId: string; businessId: string; accountId: string }) => t.importBatchId === 'batch-1' && t.businessId === 'biz1' && t.accountId === 'acc1')).toBe(true);
    expect(lineData.map((l: { direction: LineDirection }) => l.direction)).toEqual([LineDirection.CREDIT, LineDirection.DEBIT, LineDirection.CREDIT, LineDirection.CREDIT]);
    expect(lineData.map((l: { transactionId: string }) => l.transactionId)).toEqual(txData.map((t: { id: string }) => t.id));
    // whole-cent sums: 5000 + 0.1 + 0.2 is exactly 5000.3
    expect(result).toEqual({ importBatchId: 'batch-1', created: 4, totalIn: 5000.3, totalOut: 4214.5 });
  });

  it('keeps the pasted order: each row gets its own createdAt millisecond', async () => {
    const { service, prisma } = setup();
    await service.bulkCreate('u1', 'biz1', 'acc1', { rows: [income(), income(), income()] });
    const times = prisma.transaction.createMany.mock.calls[0][0].data.map((t: { createdAt: Date }) => t.createdAt.getTime());
    expect(times[1] - times[0]).toBe(1);
    expect(times[2] - times[1]).toBe(1);
  });

  it('makes a batch id when none is sent', async () => {
    const { service } = setup();
    const result = await service.bulkCreate('u1', 'biz1', 'acc1', { rows: [income()] });
    expect(result.importBatchId).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it('recomputes a calculated amount on the server and ignores the client amount', async () => {
    const { service, prisma } = setup();
    await service.bulkCreate('u1', 'biz1', 'acc1', {
      rows: [expense({ amount: 1, amountType: 'MULTIPLY', amountInputs: [1000, 5] })],
    });
    const line = prisma.line.createMany.mock.calls[0][0].data[0];
    const tx = prisma.transaction.createMany.mock.calls[0][0].data[0];
    expect(line.amount).toBe(5000);
    expect(tx).toMatchObject({ amountType: 'MULTIPLY', amountInputs: [1000, 5] });
  });

  it('a calculated row needs no amount at all', async () => {
    const { service, prisma } = setup();
    await service.bulkCreate('u1', 'biz1', 'acc1', { rows: [expense({ amount: undefined, amountType: 'SUM', amountInputs: [100, 25.5] })] });
    expect(prisma.line.createMany.mock.calls[0][0].data[0].amount).toBe(125.5);
  });

  it('reports every bad row with its position and creates nothing', async () => {
    const { service, prisma } = setup();
    const err = await failure(
      service.bulkCreate('u1', 'biz1', 'acc1', {
        rows: [
          income(),
          income({ date: 'not a date' }), // 1: bad date
          expense({ amount: -5 }), // 2: not positive
          income({ categoryId: 'catOut' }), // 3: expense category on money in
          expense({ categoryId: 'someone-elses' }), // 4: unknown category
          expense({ amountType: 'SPLIT', amountInputs: [100, 0] }), // 5: divide by zero
          expense({ date: '2099-01-01' }), // 6: far future
          'oops', // 7: not an object
          income({ surprise: 1 }), // 8: unknown field
        ],
      }),
    );
    expect(err).toBeInstanceOf(BadRequestException);
    const body = err.getResponse() as { message: string; errors: { index: number; field: string; message: string }[] };
    expect(body.message).toBe('8 of 9 rows have a problem. Nothing was added.');
    const byIndex = Object.fromEntries(body.errors.map((e) => [e.index, e]));
    expect(Object.keys(byIndex).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(byIndex[1].field).toBe('date');
    expect(byIndex[2].field).toBe('amount');
    expect(byIndex[3]).toMatchObject({ field: 'categoryId' });
    expect(byIndex[4]).toMatchObject({ field: 'categoryId', message: 'Category does not belong to this business' });
    expect(byIndex[5]).toMatchObject({ field: 'amount', message: "Number of people can't be 0." });
    expect(byIndex[6]).toMatchObject({ field: 'date', message: 'Entries cannot be dated in the future' });
    expect(byIndex[7]).toMatchObject({ field: 'row' });
    expect(byIndex[8].field).toBe('surprise');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.transaction.createMany).not.toHaveBeenCalled();
    expect(prisma.line.createMany).not.toHaveBeenCalled();
  });

  it('refuses a javascript: proof link like a single entry does', async () => {
    const { service } = setup();
    const err = await failure(service.bulkCreate('u1', 'biz1', 'acc1', { rows: [income({ proofUrl: 'javascript:alert(1)' })] }));
    const body = err.getResponse() as { errors: { index: number; field: string }[] };
    expect(body.errors).toEqual([expect.objectContaining({ index: 0, field: 'proofUrl' })]);
  });

  it('an entry without a category is allowed (uncategorized), like a single entry', async () => {
    const { service, prisma } = setup();
    await service.bulkCreate('u1', 'biz1', 'acc1', { rows: [income({ categoryId: undefined })] });
    expect(prisma.line.createMany.mock.calls[0][0].data[0].categoryId).toBeUndefined();
  });
});

describe('BulkCreateTransactionsDto', () => {
  const check = (value: object) => validate(plainToInstance(BulkCreateTransactionsDto, value), { whitelist: true, forbidNonWhitelisted: true });

  it('accepts 1 to 1000 rows', async () => {
    expect(await check({ rows: [{}] })).toHaveLength(0);
    expect(await check({ rows: Array.from({ length: 1000 }, () => ({})) })).toHaveLength(0);
  });

  it('refuses 0 rows, 1001 rows, a non-array and a bad batch id', async () => {
    expect(await check({ rows: [] })).not.toHaveLength(0);
    expect(await check({ rows: Array.from({ length: 1001 }, () => ({})) })).not.toHaveLength(0);
    expect(await check({ rows: 'x' })).not.toHaveLength(0);
    expect(await check({ rows: [{}], importBatchId: '../../etc' })).not.toHaveLength(0);
    expect(await check({ rows: [{}], importBatchId: 'a'.repeat(65) })).not.toHaveLength(0);
    expect(await check({ rows: [{}], extra: true })).not.toHaveLength(0);
  });
});

describe('TransactionService.removeBatch', () => {
  it('deletes only the batch, never an order-posted entry, and removes receipt files', async () => {
    const { service, prisma, receiptStorage, businessService } = setup();
    prisma.transaction.findMany.mockResolvedValue([
      { id: 't1', receiptFileReference: null },
      { id: 't2', receiptFileReference: '/files/r2.pdf' },
    ]);
    prisma.transaction.deleteMany.mockResolvedValue({ count: 2 });

    const result = await service.removeBatch('u1', 'biz1', 'acc1', 'batch-1');

    expect(businessService.assertAccess).toHaveBeenCalledWith('u1', 'biz1', AccessPermission.EDIT);
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { businessId: 'biz1', accountId: 'acc1', importBatchId: 'batch-1', orderId: null } }),
    );
    expect(receiptStorage.remove).toHaveBeenCalledWith('/files/r2.pdf');
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['t1', 't2'] } } });
    expect(result).toEqual({ deleted: 2 });
  });

  it('is a no-op for an unknown batch', async () => {
    const { service, prisma } = setup();
    prisma.transaction.findMany.mockResolvedValue([]);
    expect(await service.removeBatch('u1', 'biz1', 'acc1', 'nothing-here')).toEqual({ deleted: 0 });
    expect(prisma.transaction.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses a batch id that is not a safe id', async () => {
    const { service, prisma } = setup();
    await expect(service.removeBatch('u1', 'biz1', 'acc1', '../x')).rejects.toThrow(BadRequestException);
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
  });
});

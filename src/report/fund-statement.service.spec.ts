import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AccessPermission, LineDirection } from '../generated/prisma/client.js';
import { FundStatementService, OTHER_GROUP, UNTYPED_CATEGORY, UNTYPED_GROUP, buildSide } from './fund-statement.service.js';

type Row = {
  amount: number;
  direction: LineDirection;
  category: { id: string; name: string; groupName: string | null } | null;
};

const cat = (id: string, name: string, groupName: string | null) => ({ id, name, groupName });
const out = (amount: number, category: Row['category']): Row => ({ amount, direction: LineDirection.DEBIT, category });
const inn = (amount: number, category: Row['category']): Row => ({ amount, direction: LineDirection.CREDIT, category });

function setup(lines: Row[] = []) {
  const prisma = {
    account: { findUnique: vi.fn().mockResolvedValue({ id: 'acc1', businessId: 'biz1' }) },
    line: { findMany: vi.fn().mockResolvedValue(lines) },
  };
  const businessService = { assertAccess: vi.fn().mockResolvedValue({ id: 'biz1', currency: 'BDT' }) };
  const service = new FundStatementService(prisma as never, businessService as never);
  return { service, prisma, businessService };
}

describe('buildSide', () => {
  const transport = cat('c1', 'Transport', 'Overhead');
  const photo = cat('c2', 'Photography', 'Overhead');
  const product = cat('c3', 'Product purchase', null);

  it('groups by group name, then category, and counts entries', () => {
    const side = buildSide([out(250, transport), out(500, photo), out(300, photo), out(36123, product)]);

    expect(side.entries).toBe(4);
    expect(side.total).toBe(37173);
    const overhead = side.groups.find((g) => g.name === 'Overhead');
    expect(overhead).toMatchObject({ total: 1050, entries: 3 });
    expect(overhead?.categories.map((c) => [c.name, c.total, c.entries])).toEqual([
      ['Photography', 800, 2],
      ['Transport', 250, 1],
    ]);
  });

  it('files a category with no group under "Other"', () => {
    const side = buildSide([out(10, product)]);
    expect(side.groups).toEqual([
      expect.objectContaining({ name: OTHER_GROUP, total: 10, categories: [expect.objectContaining({ name: 'Product purchase' })] }),
    ]);
  });

  it('files entries with no category under "Other / not typed", always last', () => {
    const side = buildSide([out(999999, null), out(5, transport)]);
    expect(side.groups.map((g) => g.name)).toEqual(['Overhead', UNTYPED_GROUP]);
    expect(side.groups[1].categories).toEqual([
      { categoryId: null, name: UNTYPED_CATEGORY, total: 999999, entries: 1 },
    ]);
  });

  it('keeps a group name that differs only by surrounding spaces together', () => {
    const side = buildSide([out(1, cat('a', 'A', ' Overhead ')), out(2, cat('b', 'B', 'Overhead'))]);
    expect(side.groups).toHaveLength(1);
    expect(side.groups[0].total).toBe(3);
  });

  it('adds up exactly with amounts that break float maths (0.1 + 0.2)', () => {
    const side = buildSide([out(0.1, transport), out(0.2, transport), out(0.1, photo), out(0.2, product)]);

    expect(side.total).toBe(0.6);
    const groupSum = side.groups.reduce((sum, g) => Math.round((sum + g.total) * 100) / 100, 0);
    expect(groupSum).toBe(side.total);
    const overhead = side.groups.find((g) => g.name === 'Overhead');
    expect(overhead?.total).toBe(0.4);
    expect(overhead?.categories.find((c) => c.name === 'Transport')?.total).toBe(0.3);
  });

  it('group totals and category totals add up to the side total over many odd amounts', () => {
    const cents = [0.1, 0.7, 1.15, 2.05, 3.3, 9.99, 0.01, 19.95, 33.33, 66.67];
    const rows = Array.from({ length: 200 }, (_, i) =>
      out(cents[i % cents.length], i % 3 === 0 ? transport : i % 3 === 1 ? photo : product),
    );
    const side = buildSide(rows);

    const exact = Math.round(rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0)) / 100;
    expect(side.total).toBe(exact);
    for (const group of side.groups) {
      const inner = Math.round(group.categories.reduce((sum, c) => sum + Math.round(c.total * 100), 0)) / 100;
      expect(inner).toBe(group.total);
    }
    const outer = Math.round(side.groups.reduce((sum, g) => sum + Math.round(g.total * 100), 0)) / 100;
    expect(outer).toBe(side.total);
  });

  it('is empty for no entries', () => {
    expect(buildSide([])).toEqual({ groups: [], total: 0, entries: 0 });
  });
});

describe('FundStatementService.getStatement', () => {
  it('splits money in and money out and balances them without float error', async () => {
    const sales = cat('s1', 'Sales', null);
    const transport = cat('c1', 'Transport', 'Overhead');
    const { service } = setup([
      inn(0.1, sales),
      inn(0.2, sales),
      out(0.1, transport),
      out(0.15, null),
      inn(10, null),
    ]);

    const result = await service.getStatement('user1', 'biz1', {});

    expect(result.moneyIn.total).toBe(10.3);
    expect(result.moneyIn.entries).toBe(3);
    expect(result.moneyOut.total).toBe(0.25);
    expect(result.balance).toBe(10.05);
    expect(result.moneyOut.groups.map((g) => g.name)).toEqual(['Overhead', UNTYPED_GROUP]);
    expect(result.currency).toBe('BDT');
  });

  it('checks VIEW access first, so a user without access never reaches the data', async () => {
    const { service, prisma, businessService } = setup();
    businessService.assertAccess.mockRejectedValue(new ForbiddenException('no access'));

    await expect(service.getStatement('stranger', 'biz1', {})).rejects.toThrow(ForbiddenException);

    expect(businessService.assertAccess).toHaveBeenCalledWith('stranger', 'biz1', AccessPermission.VIEW);
    expect(prisma.line.findMany).not.toHaveBeenCalled();
  });

  it('works for a VIEW-only user (asks for VIEW, never EDIT)', async () => {
    const { service, businessService } = setup([inn(5, null)]);

    const result = await service.getStatement('viewer', 'biz1', {});

    expect(result.moneyIn.total).toBe(5);
    expect(businessService.assertAccess).toHaveBeenCalledTimes(1);
    expect(businessService.assertAccess.mock.calls[0][2]).toBe(AccessPermission.VIEW);
  });

  it('rejects an accountId from another business', async () => {
    const { service, prisma } = setup();
    prisma.account.findUnique.mockResolvedValue({ id: 'acc9', businessId: 'someone-elses-business' });

    await expect(service.getStatement('user1', 'biz1', { accountId: 'acc9' })).rejects.toThrow(BadRequestException);
    expect(prisma.line.findMany).not.toHaveBeenCalled();
  });

  it('rejects an accountId that does not exist', async () => {
    const { service, prisma } = setup();
    prisma.account.findUnique.mockResolvedValue(null);

    await expect(service.getStatement('user1', 'biz1', { accountId: 'nope' })).rejects.toThrow(BadRequestException);
  });

  it('filters by business, account and dates (end of the "to" day included)', async () => {
    const { service, prisma } = setup();

    await service.getStatement('user1', 'biz1', { accountId: 'acc1', from: '2026-05-01', to: '2026-05-31' });

    const where = prisma.line.findMany.mock.calls[0][0].where.transaction;
    expect(where.businessId).toBe('biz1');
    expect(where.accountId).toBe('acc1');
    expect(where.date.gte).toEqual(new Date('2026-05-01T00:00:00.000Z'));
    expect(where.date.lte).toEqual(new Date('2026-05-31T23:59:59.999Z'));
  });

  it('has no date or account filter by default', async () => {
    const { service, prisma } = setup();

    await service.getStatement('user1', 'biz1', {});

    expect(prisma.line.findMany.mock.calls[0][0].where.transaction).toEqual({ businessId: 'biz1' });
  });

  it('rejects "from" after "to"', async () => {
    const { service } = setup();
    await expect(service.getStatement('user1', 'biz1', { from: '2026-06-01', to: '2026-05-01' })).rejects.toThrow(
      BadRequestException,
    );
  });
});

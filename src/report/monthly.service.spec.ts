import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AccessPermission, LineDirection } from '../generated/prisma/client.js';
import { MonthlyService, buildMonthly } from './monthly.service.js';

const IN = LineDirection.CREDIT;
const OUT = LineDirection.DEBIT;
const line = (iso: string, amount: number, direction: LineDirection) => ({ date: new Date(iso), amount, direction });

// 2026-05 as a month index (year * 12 + zero-based month).
const MAY_2026 = 2026 * 12 + 4;

function setup(lines: ReturnType<typeof line>[] = []) {
  const prisma = {
    account: { findUnique: vi.fn().mockResolvedValue({ id: 'acc1', businessId: 'biz1' }) },
    line: {
      findMany: vi.fn().mockResolvedValue(lines.map((l) => ({ amount: l.amount, direction: l.direction, transaction: { date: l.date } }))),
    },
  };
  const businessService = { assertAccess: vi.fn().mockResolvedValue({ id: 'biz1', currency: 'BDT' }) };
  return { service: new MonthlyService(prisma as never, businessService as never), prisma, businessService };
}

describe('buildMonthly', () => {
  it('puts entries on the first and last day of a month in that month', () => {
    const result = buildMonthly(
      [
        line('2026-05-01T00:00:00.000Z', 100, IN), // first instant of May
        line('2026-05-31T23:59:59.999Z', 40, OUT), // last instant of May
        line('2026-06-01T00:00:00.000Z', 7, IN), // first instant of June
        line('2026-04-30T23:59:59.999Z', 3, IN), // last instant of April
      ],
      MAY_2026,
      2,
    );

    expect(result.rows[0]).toMatchObject({ month: '2026-05', moneyIn: 100, moneyOut: 40, net: 60 });
    expect(result.rows[1]).toMatchObject({ month: '2026-06', moneyIn: 7, moneyOut: 0, net: 7 });
    expect(result.outsideRange).toEqual({ moneyIn: 3, moneyOut: 0, net: 3 });
  });

  // The server runs in UTC, the owner is in Dhaka (UTC+6). Entries are plain
  // dates stored as UTC midnight and shown by their UTC date, so the month is
  // the UTC month whatever timezone the process happens to run in.
  describe.each(['UTC', 'Asia/Dhaka', 'America/Los_Angeles', 'Pacific/Kiritimati'])('with the process timezone set to %s', (tz) => {
    const originalTz = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = tz;
    });
    afterAll(() => {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    it('keeps the owner\'s "31 May" and "1 June" entries in May and June', () => {
      const result = buildMonthly(
        [
          line('2026-05-31T00:00:00.000Z', 10, IN), // typed as 31 May in Dhaka
          line('2026-06-01T00:00:00.000Z', 20, IN), // typed as 1 June in Dhaka (06:00 there)
          line('2026-05-31T18:30:00.000Z', 1, IN), // 00:30 on 1 June in Dhaka, still the 31st in UTC
          line('2026-05-31T17:59:59.999Z', 2, IN),
        ],
        MAY_2026,
        2,
      );

      expect(result.rows[0].moneyIn).toBe(13); // 10 + 1 + 2: all on 31 May by UTC date
      expect(result.rows[1].moneyIn).toBe(20);
      expect(result.outsideRange.net).toBe(0);
    });

    it('does not shift the last day of the year into the next month', () => {
      const result = buildMonthly(
        [line('2026-12-31T00:00:00.000Z', 5, IN), line('2027-01-01T00:00:00.000Z', 9, IN)],
        2026 * 12 + 11,
        2,
      );
      expect(result.rows.map((r) => [r.month, r.moneyIn])).toEqual([
        ['2026-12', 5],
        ['2027-01', 9],
      ]);
    });
  });

  it('starts closingBalance from the balance before the first month', () => {
    const result = buildMonthly(
      [
        line('2026-03-10T00:00:00.000Z', 1000, IN),
        line('2026-04-10T00:00:00.000Z', 250, OUT),
        line('2026-05-10T00:00:00.000Z', 100, IN),
        line('2026-06-10T00:00:00.000Z', 30, OUT),
      ],
      MAY_2026,
      2,
    );

    expect(result.openingBalance).toBe(750);
    expect(result.rows.map((r) => r.closingBalance)).toEqual([850, 820]);
  });

  it('the last closing balance equals the account balance when the range covers every entry', () => {
    const lines = [
      line('2026-05-03T00:00:00.000Z', 0.1, IN),
      line('2026-05-09T00:00:00.000Z', 0.2, IN),
      line('2026-06-30T00:00:00.000Z', 0.15, OUT),
      line('2026-07-31T00:00:00.000Z', 5000, IN),
      line('2026-07-31T00:00:00.000Z', 1288.45, OUT),
    ];
    const balance = lines.reduce((sum, l) => sum + Math.round(l.amount * 100) * (l.direction === IN ? 1 : -1), 0) / 100;

    const result = buildMonthly(lines, MAY_2026, 3);

    expect(result.rows[2].closingBalance).toBe(balance);
    expect(result.rows[2].closingBalance).toBe(3711.7);
    expect(result.outsideRange).toEqual({ moneyIn: 0, moneyOut: 0, net: 0 });
    expect(result.totals.net).toBe(balance);
  });

  it('outsideRange catches entries before AND after the months', () => {
    const result = buildMonthly(
      [
        line('2026-04-30T00:00:00.000Z', 500, IN), // before
        line('2026-02-01T00:00:00.000Z', 80, OUT), // before
        line('2026-07-01T00:00:00.000Z', 20, OUT), // after (range is May-Jun)
        line('2027-01-15T00:00:00.000Z', 1000, IN), // after
        line('2026-05-15T00:00:00.000Z', 1, IN),
      ],
      MAY_2026,
      2,
    );

    expect(result.outsideRange).toEqual({ moneyIn: 1500, moneyOut: 100, net: 1400 });
    expect(result.totals).toEqual({ moneyIn: 1, moneyOut: 0, net: 1 });
    // The after-range entries do not feed the closing balance; the before-range ones do.
    expect(result.rows[1].closingBalance).toBe(421);
  });

  it('rows are exact with amounts that break float maths', () => {
    const lines = Array.from({ length: 10 }, () => line('2026-05-10T00:00:00.000Z', 0.1, IN));
    const result = buildMonthly(lines, MAY_2026, 1);
    expect(result.rows[0].moneyIn).toBe(1);
    expect(result.rows[0].closingBalance).toBe(1);
  });

  it('gives empty months as zero rows with a carried-over closing balance', () => {
    const result = buildMonthly([line('2026-05-02T00:00:00.000Z', 100, IN)], MAY_2026, 4);
    expect(result.rows.map((r) => [r.month, r.moneyIn, r.moneyOut, r.net, r.closingBalance])).toEqual([
      ['2026-05', 100, 0, 100, 100],
      ['2026-06', 0, 0, 0, 100],
      ['2026-07', 0, 0, 0, 100],
      ['2026-08', 0, 0, 0, 100],
    ]);
  });

  it('labels months correctly across a year end', () => {
    const result = buildMonthly([], 2026 * 12 + 10, 4);
    expect(result.rows.map((r) => r.month)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('supports the full 36-month window', () => {
    const result = buildMonthly([], MAY_2026, 36);
    expect(result.rows).toHaveLength(36);
    expect(result.rows[35].month).toBe('2029-04');
  });
});

describe('MonthlyService.getMonthly', () => {
  it('defaults to 12 months ending in the current month', async () => {
    const { service } = setup();

    const result = await service.getMonthly('user1', 'biz1', {}, new Date('2026-10-12T10:00:00Z'));

    expect(result.months).toBe(12);
    expect(result.start).toBe('2025-11');
    expect(result.rows[11].month).toBe('2026-10');
  });

  it('uses the start and months it is given', async () => {
    const { service } = setup([line('2026-05-05T00:00:00.000Z', 20000, IN), line('2026-10-01T00:00:00.000Z', 2200, OUT)]);

    const result = await service.getMonthly('user1', 'biz1', { start: '2026-05', months: 6 });

    expect(result.rows.map((r) => r.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(result.rows[5].closingBalance).toBe(17800);
  });

  it('asks the database once, whatever the number of months', async () => {
    const { service, prisma } = setup();

    await service.getMonthly('user1', 'biz1', { start: '2026-01', months: 36 });

    expect(prisma.line.findMany).toHaveBeenCalledTimes(1);
  });

  it('checks VIEW access first, so a user without access never reaches the data', async () => {
    const { service, prisma, businessService } = setup();
    businessService.assertAccess.mockRejectedValue(new ForbiddenException('no access'));

    await expect(service.getMonthly('stranger', 'biz1', {})).rejects.toThrow(ForbiddenException);

    expect(businessService.assertAccess).toHaveBeenCalledWith('stranger', 'biz1', AccessPermission.VIEW);
    expect(prisma.line.findMany).not.toHaveBeenCalled();
  });

  it('rejects an accountId from another business', async () => {
    const { service, prisma } = setup();
    prisma.account.findUnique.mockResolvedValue({ id: 'acc9', businessId: 'other' });

    await expect(service.getMonthly('user1', 'biz1', { accountId: 'acc9' })).rejects.toThrow(BadRequestException);
    expect(prisma.line.findMany).not.toHaveBeenCalled();
  });

  it('narrows to one account when asked', async () => {
    const { service, prisma } = setup();

    await service.getMonthly('user1', 'biz1', { accountId: 'acc1' });

    expect(prisma.line.findMany.mock.calls[0][0].where.transaction).toEqual({ businessId: 'biz1', accountId: 'acc1' });
  });
});

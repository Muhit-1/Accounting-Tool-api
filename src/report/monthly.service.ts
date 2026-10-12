import { BadRequestException, Injectable } from '@nestjs/common';
import { BusinessService } from '../business/business.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessPermission, LineDirection } from '../generated/prisma/client.js';
import { toCents } from '../common/money.js';
import { MONTHLY_DEFAULT_MONTHS, MonthlyQueryDto } from './dto/monthly-query.dto.js';

export interface MonthlyRow {
  month: string; // 'YYYY-MM'
  moneyIn: number;
  moneyOut: number;
  net: number;
  closingBalance: number;
}

interface MonthlyLine {
  date: Date;
  amount: unknown;
  direction: LineDirection;
}

const pad = (n: number) => String(n).padStart(2, '0');

// A month is counted by the entry's UTC calendar date. The entry form sends a
// plain date ("2026-04-01"), which is stored as UTC midnight, and the report
// code and the form's own date display (`date.slice(0, 10)`) both read it in
// UTC — so the server's timezone (UTC) and the owner's (Dhaka, UTC+6) must not
// move an entry across a month line. Index = year * 12 + month (0-based).
function monthIndex(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function monthLabel(index: number): string {
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

function currentMonthIndex(now: Date): number {
  return now.getUTCFullYear() * 12 + now.getUTCMonth();
}

// Pure: one pass over the lines, whole cents as integers, so nothing drifts
// and the rows add up exactly.
export function buildMonthly(lines: MonthlyLine[], startIndex: number, months: number) {
  const inCents = Array.from({ length: months }, () => 0);
  const outCents = Array.from({ length: months }, () => 0);
  let beforeNet = 0;
  const before = { in: 0, out: 0 };
  const after = { in: 0, out: 0 };

  for (const line of lines) {
    const cents = toCents(line.amount);
    const credit = line.direction === LineDirection.CREDIT;
    const offset = monthIndex(line.date) - startIndex;
    if (offset < 0) {
      beforeNet += credit ? cents : -cents;
      before[credit ? 'in' : 'out'] += cents;
    } else if (offset >= months) {
      after[credit ? 'in' : 'out'] += cents;
    } else if (credit) {
      inCents[offset] += cents;
    } else {
      outCents[offset] += cents;
    }
  }

  let running = beforeNet;
  let totalIn = 0;
  let totalOut = 0;
  const rows: MonthlyRow[] = inCents.map((moneyIn, i) => {
    const moneyOut = outCents[i];
    running += moneyIn - moneyOut;
    totalIn += moneyIn;
    totalOut += moneyOut;
    return {
      month: monthLabel(startIndex + i),
      moneyIn: moneyIn / 100,
      moneyOut: moneyOut / 100,
      net: (moneyIn - moneyOut) / 100,
      closingBalance: running / 100,
    };
  });

  const outsideIn = before.in + after.in;
  const outsideOut = before.out + after.out;
  return {
    openingBalance: beforeNet / 100,
    rows,
    totals: { moneyIn: totalIn / 100, moneyOut: totalOut / 100, net: (totalIn - totalOut) / 100 },
    outsideRange: { moneyIn: outsideIn / 100, moneyOut: outsideOut / 100, net: (outsideIn - outsideOut) / 100 },
  };
}

@Injectable()
export class MonthlyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessService: BusinessService,
  ) {}

  async getMonthly(userId: string, businessId: string, query: MonthlyQueryDto, now: Date = new Date()) {
    const business = await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);

    if (query.accountId) {
      const account = await this.prisma.account.findUnique({ where: { id: query.accountId } });
      if (!account || account.businessId !== businessId) {
        throw new BadRequestException('Account does not belong to this business');
      }
    }

    const months = query.months ?? MONTHLY_DEFAULT_MONTHS;
    const startIndex = query.start
      ? Number(query.start.slice(0, 4)) * 12 + (Number(query.start.slice(5, 7)) - 1)
      : currentMonthIndex(now) - (months - 1);

    // One query for everything (before the window, the window, after it); the
    // balance before the first month and the "outside these months" check come
    // out of the same pass.
    const rows = await this.prisma.line.findMany({
      where: { transaction: { businessId, ...(query.accountId ? { accountId: query.accountId } : {}) } },
      select: { amount: true, direction: true, transaction: { select: { date: true } } },
    });
    const lines = rows.map((row) => ({ date: row.transaction.date, amount: row.amount, direction: row.direction }));

    return {
      currency: business.currency,
      accountId: query.accountId ?? null,
      start: monthLabel(startIndex),
      months,
      ...buildMonthly(lines, startIndex, months),
    };
  }
}

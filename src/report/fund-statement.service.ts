import { BadRequestException, Injectable } from '@nestjs/common';
import { BusinessService } from '../business/business.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessPermission, LineDirection } from '../generated/prisma/client.js';
import { addMoney, subMoney } from '../common/money.js';
import { StatementQueryDto } from './dto/statement-query.dto.js';

// Categories filed under no heading, and entries with no category at all.
export const OTHER_GROUP = 'Other';
export const UNTYPED_GROUP = 'Other / not typed';
export const UNTYPED_CATEGORY = 'Not typed';

export interface StatementCategory {
  categoryId: string | null;
  name: string;
  total: number;
  entries: number;
}

export interface StatementGroup {
  name: string;
  total: number;
  entries: number;
  categories: StatementCategory[];
}

export interface StatementSide {
  groups: StatementGroup[];
  total: number;
  entries: number;
}

interface LineRow {
  amount: unknown;
  direction: LineDirection;
  category: { id: string; name: string; groupName: string | null } | null;
}

const byTotalThenName = (a: { total: number; name: string }, b: { total: number; name: string }) =>
  b.total - a.total || a.name.localeCompare(b.name);

// Pure so the grouping and the "groups add up exactly to the total" rule can
// be tested without a database. Every sum goes through addMoney (whole cents).
export function buildSide(lines: LineRow[]): StatementSide {
  const groups = new Map<string, { group: StatementGroup; byCategory: Map<string, StatementCategory> }>();
  let total = 0;

  for (const line of lines) {
    const amount = Number(line.amount);
    const groupName = line.category ? line.category.groupName?.trim() || OTHER_GROUP : UNTYPED_GROUP;
    const categoryKey = line.category?.id ?? 'none';

    let entry = groups.get(groupName);
    if (!entry) {
      entry = { group: { name: groupName, total: 0, entries: 0, categories: [] }, byCategory: new Map() };
      groups.set(groupName, entry);
    }
    let category = entry.byCategory.get(categoryKey);
    if (!category) {
      category = {
        categoryId: line.category?.id ?? null,
        name: line.category?.name ?? UNTYPED_CATEGORY,
        total: 0,
        entries: 0,
      };
      entry.byCategory.set(categoryKey, category);
      entry.group.categories.push(category);
    }

    category.total = addMoney(category.total, amount);
    category.entries += 1;
    entry.group.total = addMoney(entry.group.total, amount);
    entry.group.entries += 1;
    total = addMoney(total, amount);
  }

  const ordered = [...groups.values()]
    .map(({ group }) => ({ ...group, categories: [...group.categories].sort(byTotalThenName) }))
    .sort((a, b) => {
      // "Other / not typed" is the leftover bucket, so it always goes last.
      if ((a.name === UNTYPED_GROUP) !== (b.name === UNTYPED_GROUP)) return a.name === UNTYPED_GROUP ? 1 : -1;
      return byTotalThenName(a, b);
    });

  return { groups: ordered, total, entries: lines.length };
}

@Injectable()
export class FundStatementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessService: BusinessService,
  ) {}

  async getStatement(userId: string, businessId: string, query: StatementQueryDto) {
    const business = await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);

    if (query.accountId) {
      const account = await this.prisma.account.findUnique({ where: { id: query.accountId } });
      if (!account || account.businessId !== businessId) {
        throw new BadRequestException('Account does not belong to this business');
      }
    }

    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    // Same end-of-day rule as the date-range report (see ReportService.parseRange).
    to?.setUTCHours(23, 59, 59, 999);
    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException('"from" must not be after "to"');
    }

    const lines = await this.prisma.line.findMany({
      where: {
        transaction: {
          businessId,
          ...(query.accountId ? { accountId: query.accountId } : {}),
          ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
        },
      },
      select: {
        amount: true,
        direction: true,
        category: { select: { id: true, name: true, groupName: true } },
      },
    });

    const moneyIn = buildSide(lines.filter((l) => l.direction === LineDirection.CREDIT));
    const moneyOut = buildSide(lines.filter((l) => l.direction === LineDirection.DEBIT));

    return {
      currency: business.currency,
      accountId: query.accountId ?? null,
      from: query.from ?? null,
      to: query.to ?? null,
      moneyIn,
      moneyOut,
      balance: subMoney(moneyIn.total, moneyOut.total),
    };
  }
}

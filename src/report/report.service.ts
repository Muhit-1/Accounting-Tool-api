import { BadRequestException, Injectable } from '@nestjs/common';
import { BusinessService } from '../business/business.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessPermission, CategoryType, LineDirection } from '../generated/prisma/client.js';
import { ReportQueryDto } from './dto/report-query.dto.js';
import { ReportPdfService } from './pdf/report-pdf.service.js';
import type { ReportPdfData, ReportPdfSection } from './pdf/report-template.js';

export interface ReportCategoryBreakdown {
  categoryId: string | null;
  categoryName: string;
  type: CategoryType;
  total: number;
}

export interface ReportTotals {
  totalIncome: number;
  totalExpense: number;
  balance: number;
}

export interface ReportTransaction {
  id: string;
  date: Date;
  memo: string | null;
  counterparty: string | null;
  amount: number;
  type: CategoryType;
  categoryName: string | null;
}

function typeForDirection(direction: LineDirection): CategoryType {
  return direction === LineDirection.CREDIT ? CategoryType.INCOME : CategoryType.EXPENSE;
}

type TxWithLines = {
  id: string;
  date: Date;
  memo: string | null;
  counterparty: string | null;
  lines: { amount: unknown; direction: LineDirection; categoryId: string | null; category: { id: string; name: string } | null }[];
};

function toReportTransactions(transactions: TxWithLines[]): ReportTransaction[] {
  return transactions.map((tx) => {
    const line = tx.lines[0];
    return {
      id: tx.id,
      date: tx.date,
      memo: tx.memo,
      counterparty: tx.counterparty,
      amount: line ? Number(line.amount) : 0,
      type: line ? typeForDirection(line.direction) : CategoryType.EXPENSE,
      categoryName: line?.category?.name ?? null,
    };
  });
}

function computeTotals(transactions: ReportTransaction[]): ReportTotals {
  return transactions.reduce<ReportTotals>(
    (acc, tx) => {
      if (tx.type === CategoryType.INCOME) acc.totalIncome += tx.amount;
      else acc.totalExpense += tx.amount;
      acc.balance = acc.totalIncome - acc.totalExpense;
      return acc;
    },
    { totalIncome: 0, totalExpense: 0, balance: 0 },
  );
}

function computeCategoryBreakdown(transactions: ReportTransaction[]): ReportCategoryBreakdown[] {
  const buckets = new Map<string, ReportCategoryBreakdown>();
  for (const tx of transactions) {
    const key = `${tx.type}:${tx.categoryName ?? 'uncategorized'}`;
    const name = tx.categoryName ?? `Uncategorized ${tx.type.toLowerCase()}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.total += tx.amount;
    } else {
      buckets.set(key, { categoryId: null, categoryName: name, type: tx.type, total: tx.amount });
    }
  }
  return [...buckets.values()].sort((a, b) => b.total - a.total);
}

@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessService: BusinessService,
    private readonly reportPdfService: ReportPdfService,
  ) {}

  private parseRange(dto: ReportQueryDto): { from: Date; to: Date } {
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    to.setUTCHours(23, 59, 59, 999);
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('"from" must not be after "to"');
    }
    return { from, to };
  }

  private async assertLedgerBelongsToBusiness(businessId: string, ledgerId: string) {
    const ledger = await this.prisma.ledger.findUnique({ where: { id: ledgerId } });
    if (!ledger || ledger.businessId !== businessId) {
      throw new BadRequestException('Ledger does not belong to this business');
    }
    return ledger;
  }

  private async fetchTransactions(businessId: string, from: Date, to: Date, ledgerId?: string) {
    return this.prisma.transaction.findMany({
      where: {
        businessId,
        ...(ledgerId ? { ledgerId } : {}),
        date: { gte: from, lte: to },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      include: { lines: { include: { category: true } } },
    });
  }

  async generateForBusiness(userId: string, businessId: string, dto: ReportQueryDto) {
    const business = await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);
    const { from, to } = this.parseRange(dto);

    let ledger: { id: string; name: string } | null = null;
    if (dto.ledgerId) {
      ledger = await this.assertLedgerBelongsToBusiness(businessId, dto.ledgerId);
    }

    const raw = await this.fetchTransactions(businessId, from, to, dto.ledgerId);
    const transactions = toReportTransactions(raw);

    return {
      business: { id: business.id, name: business.name, currency: business.currency },
      ledger: ledger ? { id: ledger.id, name: ledger.name } : null,
      period: { from: dto.from, to: dto.to },
      totals: computeTotals(transactions),
      byCategory: computeCategoryBreakdown(transactions),
      transactions,
    };
  }

  async generateCombined(userId: string, dto: ReportQueryDto) {
    const { from, to } = this.parseRange(dto);
    const businesses = await this.businessService.findAllForOwner(userId);

    const perBusiness = await Promise.all(
      businesses.map(async (business) => {
        const raw = await this.fetchTransactions(business.id, from, to);
        const transactions = toReportTransactions(raw);
        return {
          business: { id: business.id, name: business.name, currency: business.currency },
          totals: computeTotals(transactions),
          byCategory: computeCategoryBreakdown(transactions),
          transactions: transactions.map((tx) => ({
            ...tx,
            businessId: business.id,
            businessName: business.name,
            currency: business.currency,
          })),
        };
      }),
    );

    const combinedTotals = perBusiness.reduce<ReportTotals>(
      (acc, b) => {
        acc.totalIncome += b.totals.totalIncome;
        acc.totalExpense += b.totals.totalExpense;
        acc.balance += b.totals.balance;
        return acc;
      },
      { totalIncome: 0, totalExpense: 0, balance: 0 },
    );

    const transactions = perBusiness
      .flatMap((b) => b.transactions)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      period: { from: dto.from, to: dto.to },
      businesses: perBusiness.map(({ business, totals, byCategory }) => ({ business, totals, byCategory })),
      combinedTotals,
      transactions,
    };
  }

  async generatePdfForBusiness(userId: string, businessId: string, dto: ReportQueryDto): Promise<Buffer> {
    const report = await this.generateForBusiness(userId, businessId, dto);
    const section: ReportPdfSection = {
      businessName: report.business.name,
      currency: report.business.currency,
      ledgerName: report.ledger?.name,
      totals: report.totals,
      byCategory: report.byCategory,
      transactions: report.transactions,
    };
    const data: ReportPdfData = {
      title: `${report.business.name} — Report`,
      periodLabel: periodLabel(dto.from, dto.to),
      sections: [section],
    };
    return this.reportPdfService.render(data);
  }

  async generatePdfCombined(userId: string, dto: ReportQueryDto): Promise<Buffer> {
    const report = await this.generateCombined(userId, dto);
    const data: ReportPdfData = {
      title: 'Combined Report — All Businesses',
      periodLabel: periodLabel(dto.from, dto.to),
      sections: report.businesses.map((b) => ({
        businessName: b.business.name,
        currency: b.business.currency,
        totals: b.totals,
        byCategory: b.byCategory,
        transactions: report.transactions.filter((tx) => tx.businessId === b.business.id),
      })),
    };
    return this.reportPdfService.render(data);
  }
}

function periodLabel(from: string, to: string): string {
  const format = (value: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
  return `${format(from)} – ${format(to)}`;
}

import { Injectable } from '@nestjs/common';
import { BusinessService } from '../business/business.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessPermission, LineDirection } from '../generated/prisma/client.js';

export interface CategoryBreakdown {
  categoryId: string | null;
  categoryName: string;
  total: number;
}

export interface BusinessTotals {
  totalIncome: number;
  totalExpense: number;
  balance: number;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessService: BusinessService,
  ) {}

  private async computeTotals(businessId: string): Promise<BusinessTotals> {
    const lines = await this.prisma.line.findMany({ where: { transaction: { businessId } } });
    return lines.reduce<BusinessTotals>(
      (acc, line) => {
        const amount = Number(line.amount);
        if (line.direction === LineDirection.CREDIT) {
          acc.totalIncome += amount;
        } else {
          acc.totalExpense += amount;
        }
        acc.balance = acc.totalIncome - acc.totalExpense;
        return acc;
      },
      { totalIncome: 0, totalExpense: 0, balance: 0 },
    );
  }

  private async computeCategoryBreakdown(businessId: string): Promise<CategoryBreakdown[]> {
    const lines = await this.prisma.line.findMany({
      where: { transaction: { businessId } },
      include: { category: true },
    });

    const buckets = new Map<string, CategoryBreakdown>();
    for (const line of lines) {
      const key = line.categoryId ?? `uncategorized-${line.direction}`;
      const name =
        line.category?.name ??
        (line.direction === LineDirection.CREDIT ? 'Uncategorized income' : 'Uncategorized expense');
      const existing = buckets.get(key);
      const amount = Number(line.amount);
      if (existing) {
        existing.total += amount;
      } else {
        buckets.set(key, { categoryId: line.categoryId, categoryName: name, total: amount });
      }
    }
    return [...buckets.values()].sort((a, b) => b.total - a.total);
  }

  async getBusinessDashboard(userId: string, businessId: string) {
    const business = await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);
    const [totals, byCategory] = await Promise.all([
      this.computeTotals(businessId),
      this.computeCategoryBreakdown(businessId),
    ]);
    return { businessId: business.id, businessName: business.name, ...totals, byCategory };
  }

  async getCombinedDashboard(userId: string) {
    const businesses = await this.prisma.business.findMany({ where: { ownerId: userId } });
    const perBusiness = await Promise.all(
      businesses.map(async (business) => ({
        businessId: business.id,
        businessName: business.name,
        currency: business.currency,
        ...(await this.computeTotals(business.id)),
      })),
    );

    const combined = perBusiness.reduce<BusinessTotals>(
      (acc, b) => {
        acc.totalIncome += b.totalIncome;
        acc.totalExpense += b.totalExpense;
        acc.balance += b.balance;
        return acc;
      },
      { totalIncome: 0, totalExpense: 0, balance: 0 },
    );

    return { businesses: perBusiness, combined };
  }
}

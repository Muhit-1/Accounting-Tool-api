import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessService } from '../business/business.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessPermission, CategoryType, LineDirection } from '../generated/prisma/client.js';
import { CreateTransactionDto } from './dto/create-transaction.dto.js';
import { UpdateTransactionDto } from './dto/update-transaction.dto.js';

// Phase 1 stores one Line per Transaction (money-in/money-out), not a
// balanced debit/credit pair — see prisma/schema.prisma. INCOME entries are
// recorded as a CREDIT line, EXPENSE entries as a DEBIT line, so a running
// balance is just (sum of CREDIT lines) - (sum of DEBIT lines).
function directionForType(type: CategoryType): LineDirection {
  return type === CategoryType.INCOME ? LineDirection.CREDIT : LineDirection.DEBIT;
}

function typeForDirection(direction: LineDirection): CategoryType {
  return direction === LineDirection.CREDIT ? CategoryType.INCOME : CategoryType.EXPENSE;
}

function toResponse(tx: {
  id: string;
  ledgerId: string;
  date: Date;
  memo: string | null;
  createdAt: Date;
  lines: { amount: unknown; direction: LineDirection; categoryId: string | null; category: { id: string; name: string } | null }[];
}) {
  const line = tx.lines[0];
  return {
    id: tx.id,
    ledgerId: tx.ledgerId,
    date: tx.date,
    memo: tx.memo,
    amount: line ? Number(line.amount) : 0,
    type: line ? typeForDirection(line.direction) : null,
    category: line?.category ?? null,
    createdAt: tx.createdAt,
  };
}

@Injectable()
export class TransactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessService: BusinessService,
  ) {}

  private async assertCategoryBelongsToBusiness(businessId: string, categoryId: string, type: CategoryType) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category || category.businessId !== businessId) {
      throw new BadRequestException('Category does not belong to this business');
    }
    if (category.type !== type) {
      throw new BadRequestException(
        `Category "${category.name}" is a ${category.type} category and can't be used on a ${type} transaction`,
      );
    }
  }

  private async assertLedgerBelongsToBusiness(businessId: string, ledgerId: string) {
    const ledger = await this.prisma.ledger.findUnique({ where: { id: ledgerId } });
    if (!ledger || ledger.businessId !== businessId) {
      throw new BadRequestException('Ledger does not belong to this business');
    }
  }

  async create(userId: string, businessId: string, dto: CreateTransactionDto) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    await this.assertLedgerBelongsToBusiness(businessId, dto.ledgerId);
    if (dto.categoryId) {
      await this.assertCategoryBelongsToBusiness(businessId, dto.categoryId, dto.type);
    }

    const tx = await this.prisma.transaction.create({
      data: {
        businessId,
        ledgerId: dto.ledgerId,
        date: new Date(dto.date),
        memo: dto.memo,
        lines: {
          create: {
            amount: dto.amount,
            direction: directionForType(dto.type),
            categoryId: dto.categoryId,
          },
        },
      },
      include: { lines: { include: { category: true } } },
    });

    return toResponse(tx);
  }

  async findAllForBusiness(userId: string, businessId: string, ledgerId?: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);
    if (ledgerId) {
      await this.assertLedgerBelongsToBusiness(businessId, ledgerId);
    }
    const transactions = await this.prisma.transaction.findMany({
      where: ledgerId ? { businessId, ledgerId } : { businessId },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      include: { lines: { include: { category: true } } },
    });

    let runningBalance = 0;
    return transactions.map((tx) => {
      const entry = toResponse(tx);
      runningBalance += entry.type === CategoryType.INCOME ? entry.amount : -entry.amount;
      return { ...entry, runningBalance };
    });
  }

  async findOneForBusiness(userId: string, businessId: string, id: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);
    const tx = await this.prisma.transaction.findUnique({
      where: { id },
      include: { lines: { include: { category: true } } },
    });
    if (!tx) {
      throw new NotFoundException('Transaction not found');
    }
    if (tx.businessId !== businessId) {
      throw new ForbiddenException('This transaction does not belong to that business');
    }
    return toResponse(tx);
  }

  async update(userId: string, businessId: string, id: string, dto: UpdateTransactionDto) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    const existing = await this.prisma.transaction.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!existing) {
      throw new NotFoundException('Transaction not found');
    }
    if (existing.businessId !== businessId) {
      throw new ForbiddenException('This transaction does not belong to that business');
    }

    const line = existing.lines[0];
    const nextType = dto.type ?? typeForDirection(line.direction);
    if (dto.categoryId) {
      await this.assertCategoryBelongsToBusiness(businessId, dto.categoryId, nextType);
    }
    if (dto.ledgerId) {
      await this.assertLedgerBelongsToBusiness(businessId, dto.ledgerId);
    }

    const tx = await this.prisma.transaction.update({
      where: { id },
      data: {
        ledgerId: dto.ledgerId,
        date: dto.date ? new Date(dto.date) : undefined,
        memo: dto.memo,
        lines: {
          update: {
            where: { id: line.id },
            data: {
              amount: dto.amount,
              direction: dto.type ? directionForType(dto.type) : undefined,
              categoryId: dto.categoryId,
            },
          },
        },
      },
      include: { lines: { include: { category: true } } },
    });

    return toResponse(tx);
  }

  async remove(userId: string, businessId: string, id: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    const tx = await this.prisma.transaction.findUnique({ where: { id } });
    if (!tx) {
      throw new NotFoundException('Transaction not found');
    }
    if (tx.businessId !== businessId) {
      throw new ForbiddenException('This transaction does not belong to that business');
    }
    await this.prisma.transaction.delete({ where: { id } });
    return { id };
  }

  async getBalance(userId: string, businessId: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);
    const lines = await this.prisma.line.findMany({
      where: { transaction: { businessId } },
    });

    const totals = lines.reduce(
      (acc, l) => {
        const amount = Number(l.amount);
        if (l.direction === LineDirection.CREDIT) {
          acc.totalIncome += amount;
        } else {
          acc.totalExpense += amount;
        }
        return acc;
      },
      { totalIncome: 0, totalExpense: 0 },
    );

    return {
      totalIncome: totals.totalIncome,
      totalExpense: totals.totalExpense,
      balance: totals.totalIncome - totals.totalExpense,
    };
  }
}

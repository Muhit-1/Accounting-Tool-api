import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessService } from '../business/business.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessPermission, LineDirection } from '../generated/prisma/client.js';
import { CreateLedgerDto } from './dto/create-ledger.dto.js';
import { UpdateLedgerDto } from './dto/update-ledger.dto.js';

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessService: BusinessService,
  ) {}

  private async computeTotals(ledgerId: string) {
    const lines = await this.prisma.line.findMany({ where: { transaction: { ledgerId } } });
    return lines.reduce(
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

  async create(userId: string, businessId: string, dto: CreateLedgerDto) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    return this.prisma.ledger.create({ data: { businessId, ...dto } });
  }

  async findAllForBusiness(userId: string, businessId: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);
    const ledgers = await this.prisma.ledger.findMany({
      where: { businessId },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(
      ledgers.map(async (ledger) => ({ ...ledger, ...(await this.computeTotals(ledger.id)) })),
    );
  }

  private async findLedgerInBusiness(businessId: string, id: string) {
    const ledger = await this.prisma.ledger.findUnique({ where: { id } });
    if (!ledger) {
      throw new NotFoundException('Ledger not found');
    }
    if (ledger.businessId !== businessId) {
      throw new ForbiddenException('This ledger does not belong to that business');
    }
    return ledger;
  }

  async findOneForBusiness(userId: string, businessId: string, id: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);
    const ledger = await this.findLedgerInBusiness(businessId, id);
    return { ...ledger, ...(await this.computeTotals(ledger.id)) };
  }

  async update(userId: string, businessId: string, id: string, dto: UpdateLedgerDto) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    await this.findLedgerInBusiness(businessId, id);
    return this.prisma.ledger.update({ where: { id }, data: dto });
  }

  async remove(userId: string, businessId: string, id: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    await this.findLedgerInBusiness(businessId, id);
    await this.prisma.ledger.delete({ where: { id } });
    return { id };
  }
}

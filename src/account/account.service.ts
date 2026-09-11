import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessService } from '../business/business.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessPermission, LineDirection } from '../generated/prisma/client.js';
import { CreateAccountDto } from './dto/create-account.dto.js';
import { UpdateAccountDto } from './dto/update-account.dto.js';

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessService: BusinessService,
  ) {}

  private async computeTotals(accountId: string) {
    const lines = await this.prisma.line.findMany({ where: { transaction: { accountId } } });
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

  async create(userId: string, businessId: string, dto: CreateAccountDto) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    return this.prisma.account.create({ data: { businessId, ...dto } });
  }

  async findAllForBusiness(userId: string, businessId: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);
    const accounts = await this.prisma.account.findMany({
      where: { businessId },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(
      accounts.map(async (account) => ({ ...account, ...(await this.computeTotals(account.id)) })),
    );
  }

  private async findAccountInBusiness(businessId: string, id: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    if (account.businessId !== businessId) {
      throw new ForbiddenException('This account does not belong to that business');
    }
    return account;
  }

  async findOneForBusiness(userId: string, businessId: string, id: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);
    const account = await this.findAccountInBusiness(businessId, id);
    return { ...account, ...(await this.computeTotals(account.id)) };
  }

  async update(userId: string, businessId: string, id: string, dto: UpdateAccountDto) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    await this.findAccountInBusiness(businessId, id);
    return this.prisma.account.update({ where: { id }, data: dto });
  }

  async remove(userId: string, businessId: string, id: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    await this.findAccountInBusiness(businessId, id);
    await this.prisma.account.delete({ where: { id } });
    return { id };
  }
}

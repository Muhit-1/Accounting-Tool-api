import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessService } from '../business/business.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessPermission, CategoryType, LineDirection, Prisma } from '../generated/prisma/client.js';
import { CreateTransactionDto } from './dto/create-transaction.dto.js';
import { UpdateTransactionDto } from './dto/update-transaction.dto.js';
import { ReceiptStorageService } from './receipt-storage.service.js';
import { matchesFileSignature } from '../common/file-signature.js';
import { addMoney, subMoney } from '../common/money.js';
import { assertPlausibleEntryDate } from '../common/entry-date.js';
import { CalcError, computeAmount } from '../common/calc.js';

const ALLOWED_RECEIPT_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_RECEIPT_BYTES = 15 * 1024 * 1024;

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

// amountInputs is a Json column; anything that is not a plain list of numbers
// (it never should be) reads as "no inputs" rather than breaking the list.
function readInputs(value: unknown): number[] | null {
  return Array.isArray(value) && value.every((v) => typeof v === 'number') ? (value as number[]) : null;
}

function toResponse(tx: {
  id: string;
  accountId: string;
  date: Date;
  memo: string | null;
  counterparty: string | null;
  receiptFileName: string | null;
  proofUrl?: string | null;
  orderId?: string | null;
  amountType?: string | null;
  amountInputs?: unknown;
  createdAt: Date;
  lines: { amount: unknown; direction: LineDirection; categoryId: string | null; category: { id: string; name: string } | null }[];
}) {
  const line = tx.lines[0];
  return {
    id: tx.id,
    accountId: tx.accountId,
    date: tx.date,
    memo: tx.memo,
    counterparty: tx.counterparty,
    receiptFileName: tx.receiptFileName,
    proofUrl: tx.proofUrl ?? null,
    // Set for an entry posted by a delivered order; it can only change through the order.
    orderId: tx.orderId ?? null,
    // null = an entry made before amount types existed = a fixed amount.
    amountType: tx.amountType ?? null,
    amountInputs: readInputs(tx.amountInputs),
    amount: line ? Number(line.amount) : 0,
    type: line ? typeForDirection(line.direction) : null,
    category: line?.category ?? null,
    createdAt: tx.createdAt,
  };
}

// The server, not the client, decides the saved amount for every type but
// FIXED: it recomputes from the named boxes (common/calc.ts) so a tampered or
// stale preview can never be stored.
function calculate(amountType: string, amountInputs: unknown): number {
  try {
    return computeAmount(amountType, amountInputs);
  } catch (err) {
    if (err instanceof CalcError) throw new BadRequestException(err.message);
    throw err;
  }
}

// An entry posted by a delivered order is owned by that order (see
// OrderService.syncFundEntry): editing or deleting it here would leave the
// order and the books disagreeing, so the order has to be changed instead.
function assertNotOrderEntry(tx: { orderId?: string | null }) {
  if (tx.orderId) {
    throw new ConflictException('This entry comes from an order. Change the order instead.');
  }
}

@Injectable()
export class TransactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessService: BusinessService,
    private readonly receiptStorage: ReceiptStorageService,
  ) {}

  private async findTransactionInBusiness(businessId: string, id: string) {
    const tx = await this.prisma.transaction.findUnique({ where: { id } });
    if (!tx) {
      throw new NotFoundException('Transaction not found');
    }
    if (tx.businessId !== businessId) {
      throw new ForbiddenException('This transaction does not belong to that business');
    }
    return tx;
  }

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

  private async assertAccountBelongsToBusiness(businessId: string, accountId: string) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account || account.businessId !== businessId) {
      throw new BadRequestException('Account does not belong to this business');
    }
  }

  async create(userId: string, businessId: string, dto: CreateTransactionDto) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    const date = assertPlausibleEntryDate(dto.date);
    await this.assertAccountBelongsToBusiness(businessId, dto.accountId);
    if (dto.categoryId) {
      await this.assertCategoryBelongsToBusiness(businessId, dto.categoryId, dto.type);
    }

    const calculated = dto.amountType && dto.amountType !== 'FIXED';
    if (!calculated && dto.amount === undefined) {
      throw new BadRequestException('amount must be a positive number');
    }
    const amount = calculated ? calculate(dto.amountType as string, dto.amountInputs) : (dto.amount as number);

    const tx = await this.prisma.transaction.create({
      data: {
        businessId,
        accountId: dto.accountId,
        date,
        memo: dto.memo,
        counterparty: dto.counterparty,
        proofUrl: dto.proofUrl,
        amountType: calculated ? dto.amountType : undefined,
        amountInputs: calculated ? dto.amountInputs : undefined,
        lines: {
          create: {
            amount,
            direction: directionForType(dto.type),
            categoryId: dto.categoryId,
          },
        },
      },
      include: { lines: { include: { category: true } } },
    });

    return toResponse(tx);
  }

  async findAllForBusiness(userId: string, businessId: string, accountId?: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);
    if (accountId) {
      await this.assertAccountBelongsToBusiness(businessId, accountId);
    }
    const transactions = await this.prisma.transaction.findMany({
      where: accountId ? { businessId, accountId } : { businessId },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      include: { lines: { include: { category: true } } },
    });

    let runningBalance = 0;
    return transactions.map((tx) => {
      const entry = toResponse(tx);
      runningBalance =
        entry.type === CategoryType.INCOME ? addMoney(runningBalance, entry.amount) : subMoney(runningBalance, entry.amount);
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
    assertNotOrderEntry(existing);

    // An edit form re-sends the date untouched; only a changed date is vetted,
    // so entries saved before this rule existed stay editable.
    const dateChanged = dto.date !== undefined && new Date(dto.date).getTime() !== existing.date.getTime();
    const date = dto.date && dateChanged ? assertPlausibleEntryDate(dto.date) : undefined;
    const line = existing.lines[0];
    const nextType = dto.type ?? typeForDirection(line.direction);
    if (dto.categoryId) {
      await this.assertCategoryBelongsToBusiness(businessId, dto.categoryId, nextType);
    }
    // Flipping INCOME <-> EXPENSE without picking a new category would leave
    // the entry filed under a category of the opposite type; drop it instead.
    let categoryId: string | null | undefined = dto.categoryId;
    if (dto.type && dto.type !== typeForDirection(line.direction) && dto.categoryId === undefined) {
      categoryId = null;
    }
    if (dto.accountId) {
      await this.assertAccountBelongsToBusiness(businessId, dto.accountId);
    }
    const amountChange = this.resolveAmountChange(dto, existing.amountType);

    const tx = await this.prisma.transaction.update({
      where: { id },
      data: {
        accountId: dto.accountId,
        date,
        memo: dto.memo,
        counterparty: dto.counterparty,
        proofUrl: dto.proofUrl,
        amountType: amountChange.amountType,
        amountInputs: amountChange.amountInputs,
        lines: {
          update: {
            where: { id: line.id },
            data: {
              amount: amountChange.amount,
              direction: dto.type ? directionForType(dto.type) : undefined,
              categoryId,
            },
          },
        },
      },
      include: { lines: { include: { category: true } } },
    });

    return toResponse(tx);
  }

  // What an edit does to the amount columns. Rules:
  //  - a calculated type (with its boxes) -> the server recomputes and saves that;
  //  - FIXED -> back to a plain amount: type and boxes are cleared;
  //  - only `amount` sent for an entry that was calculated -> it is now a
  //    typed-in number, so the stale boxes are cleared too (they would no
  //    longer reproduce the amount);
  //  - nothing about the amount sent -> left exactly as is.
  private resolveAmountChange(
    dto: UpdateTransactionDto,
    existingType: string | null,
  ): { amount?: number; amountType?: string | null; amountInputs?: number[] | typeof Prisma.DbNull } {
    const requested = dto.amountType;
    if (requested && requested !== 'FIXED') {
      return { amount: calculate(requested, dto.amountInputs), amountType: requested, amountInputs: dto.amountInputs };
    }
    if (requested === 'FIXED') {
      return { amount: dto.amount, amountType: null, amountInputs: Prisma.DbNull };
    }
    if (dto.amountInputs !== undefined) {
      if (!existingType || existingType === 'FIXED') {
        throw new BadRequestException('Choose an amount type for those numbers');
      }
      return { amount: calculate(existingType, dto.amountInputs), amountInputs: dto.amountInputs };
    }
    if (dto.amount !== undefined && existingType) {
      return { amount: dto.amount, amountType: null, amountInputs: Prisma.DbNull };
    }
    return { amount: dto.amount };
  }

  async remove(userId: string, businessId: string, id: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    const tx = await this.findTransactionInBusiness(businessId, id);
    assertNotOrderEntry(tx);
    if (tx.receiptFileReference) {
      await this.receiptStorage.remove(tx.receiptFileReference);
    }
    await this.prisma.transaction.delete({ where: { id } });
    return { id };
  }

  // Attaches the invoice/receipt file the user uploaded when creating this
  // entry via "Upload invoice" — a separate step from create() so the main
  // create-transaction endpoint stays plain JSON; the file only needs to
  // exist once the entry itself is confirmed and saved.
  async attachReceipt(
    userId: string,
    businessId: string,
    id: string,
    file: { mimetype: string; size: number; originalname: string; buffer: Buffer } | undefined,
  ) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    const tx = await this.findTransactionInBusiness(businessId, id);
    assertNotOrderEntry(tx);

    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    if (!ALLOWED_RECEIPT_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Please upload a PDF, JPG, PNG, or WEBP of the invoice');
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      throw new BadRequestException('That file is too large');
    }
    if (!matchesFileSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException("That file's contents don't match a PDF, JPG, PNG, or WEBP");
    }

    if (tx.receiptFileReference) {
      await this.receiptStorage.remove(tx.receiptFileReference);
    }
    const fileReference = await this.receiptStorage.save(businessId, id, file.mimetype, file.buffer);

    const updated = await this.prisma.transaction.update({
      where: { id },
      data: {
        receiptFileReference: fileReference,
        receiptFileName: file.originalname.slice(0, 150),
        receiptMimeType: file.mimetype,
      },
      include: { lines: { include: { category: true } } },
    });
    return toResponse(updated);
  }

  async getReceipt(userId: string, businessId: string, id: string): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);
    const tx = await this.findTransactionInBusiness(businessId, id);
    if (!tx.receiptFileReference || !tx.receiptFileName || !tx.receiptMimeType) {
      throw new NotFoundException('This entry has no uploaded invoice');
    }
    const buffer = await this.receiptStorage.read(tx.receiptFileReference);
    return { buffer, filename: tx.receiptFileName, mimeType: tx.receiptMimeType };
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
          acc.totalIncome = addMoney(acc.totalIncome, amount);
        } else {
          acc.totalExpense = addMoney(acc.totalExpense, amount);
        }
        return acc;
      },
      { totalIncome: 0, totalExpense: 0 },
    );

    return {
      totalIncome: totals.totalIncome,
      totalExpense: totals.totalExpense,
      balance: subMoney(totals.totalIncome, totals.totalExpense),
    };
  }
}

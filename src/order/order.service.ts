import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessService } from '../business/business.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AccessPermission,
  CategoryType,
  LineDirection,
  OrderPostingRule,
  OrderStatus,
  Prisma,
} from '../generated/prisma/client.js';
import { addMoney, subMoney } from '../common/money.js';
import { assertPlausibleEntryDate } from '../common/entry-date.js';
import { normalizeBdPhone } from '../common/phone.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { UpdateOrderDto } from './dto/update-order.dto.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';
import { canTransition, isDeletable, isFinal, isInProgress } from './order-status.js';
import { formatOrderNumber } from './order-number.js';

// Categories the posted fund entries are filed under; created on first use.
// They carry a systemKey, so they are locked ("Posted automatically").
export const ORDER_INCOME_CATEGORY = 'Orders (auto)';
export const ORDER_EXPENSE_CATEGORY = 'Orders paid from fund (auto)';
const ORDER_INCOME_KEY = 'ORDERS_IN';
const ORDER_EXPENSE_KEY = 'ORDERS_OUT';

interface OrderRow {
  id: string;
  accountId: string;
  number: number;
  orderDate: Date;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  items: string | null;
  subtotal: unknown;
  deliveryCharge: unknown;
  discount: unknown;
  total: unknown;
  paymentMethod: string | null;
  status: OrderStatus;
  postingRule: OrderPostingRule;
  deliveryDate: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  transaction?: { id: string } | null;
}

interface BusinessRef {
  name: string;
  orderPrefix: string | null;
}

// The four tiles above the order list. Money sums use addMoney (whole cents).
// "Delivered value" counts orders that bring money in; an order paid out of
// the fund is a cost, not a sale, so it is left out of both money figures.
export function summarizeOrders(orders: Pick<OrderRow, 'status' | 'total' | 'discount' | 'postingRule'>[]) {
  let inProgress = 0;
  let delivered = 0;
  let deliveredValue = 0;
  let discountsOnDelivered = 0;
  for (const order of orders) {
    if (isInProgress(order.status)) inProgress += 1;
    if (order.status !== OrderStatus.DELIVERED) continue;
    delivered += 1;
    if (order.postingRule === OrderPostingRule.MONEY_IN) {
      deliveredValue = addMoney(deliveredValue, Number(order.total));
      discountsOnDelivered = addMoney(discountsOnDelivered, Number(order.discount));
    }
  }
  return { orders: orders.length, inProgress, delivered, deliveredValue, discountsOnDelivered };
}

// subtotal + delivery charge - discount, in whole cents. Never trusted from the client.
export function computeOrderTotal(subtotal: number, deliveryCharge: number, discount: number): number {
  const total = subMoney(addMoney(subtotal, deliveryCharge), discount);
  if (total < 0) {
    throw new BadRequestException('The discount is bigger than the subtotal plus delivery charge');
  }
  return total;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessService: BusinessService,
  ) {}

  private toResponse(order: OrderRow, business: BusinessRef) {
    return {
      id: order.id,
      accountId: order.accountId,
      number: order.number,
      displayNumber: formatOrderNumber(business.orderPrefix, business.name, order.number),
      orderDate: order.orderDate,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      customerAddress: order.customerAddress,
      items: order.items,
      subtotal: Number(order.subtotal),
      deliveryCharge: Number(order.deliveryCharge),
      discount: Number(order.discount),
      total: Number(order.total),
      paymentMethod: order.paymentMethod,
      status: order.status,
      postingRule: order.postingRule,
      deliveryDate: order.deliveryDate,
      notes: order.notes,
      // The fund entry this order owns while it is DELIVERED.
      transactionId: order.transaction?.id ?? null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private async findOwned(businessId: string, id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { transaction: { select: { id: true } } } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.businessId !== businessId) {
      throw new ForbiddenException('This order does not belong to that business');
    }
    return order;
  }

  private async assertAccountBelongsToBusiness(businessId: string, accountId: string) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account || account.businessId !== businessId) {
      throw new BadRequestException('Account does not belong to this business');
    }
  }

  private async ensureCategory(db: Prisma.TransactionClient, businessId: string, type: CategoryType): Promise<string> {
    const income = type === CategoryType.INCOME;
    const name = income ? ORDER_INCOME_CATEGORY : ORDER_EXPENSE_CATEGORY;
    const systemKey = income ? ORDER_INCOME_KEY : ORDER_EXPENSE_KEY;
    const found =
      (await db.category.findFirst({ where: { businessId, type, systemKey } })) ??
      (await db.category.findFirst({ where: { businessId, type, name } }));
    if (found) {
      // A category the owner made by hand with the same name becomes the system one.
      if (!found.systemKey) await db.category.update({ where: { id: found.id }, data: { systemKey } });
      return found.id;
    }
    return (await db.category.create({ data: { businessId, name, type, systemKey } })).id;
  }

  // Keeps the order's fund entry true to its state, inside the same database
  // transaction as the order change so it can never half-save:
  //  - DELIVERED  -> the entry exists, with the order's total, direction, account and date
  //  - anything else -> the entry does not exist
  // The entry is dated by the delivery date (the order date when there is none).
  private async syncFundEntry(db: Prisma.TransactionClient, businessId: string, order: OrderRow, business: BusinessRef) {
    const existing = await db.transaction.findUnique({ where: { orderId: order.id }, include: { lines: true } });

    if (order.status !== OrderStatus.DELIVERED) {
      if (existing) {
        await db.transaction.delete({ where: { id: existing.id } });
      }
      return null;
    }

    const amount = Number(order.total);
    if (amount <= 0) {
      throw new BadRequestException('A delivered order needs a total above 0');
    }
    const type = order.postingRule === OrderPostingRule.MONEY_IN ? CategoryType.INCOME : CategoryType.EXPENSE;
    const direction = type === CategoryType.INCOME ? LineDirection.CREDIT : LineDirection.DEBIT;
    const categoryId = await this.ensureCategory(db, businessId, type);
    const date = order.deliveryDate ?? order.orderDate;
    const memo = `Order ${formatOrderNumber(business.orderPrefix, business.name, order.number)}`;

    if (existing) {
      await db.transaction.update({
        where: { id: existing.id },
        data: {
          accountId: order.accountId,
          date,
          memo,
          counterparty: order.customerName,
          lines: { update: { where: { id: existing.lines[0].id }, data: { amount, direction, categoryId } } },
        },
      });
      return existing.id;
    }
    const created = await db.transaction.create({
      data: {
        businessId,
        accountId: order.accountId,
        date,
        memo,
        counterparty: order.customerName,
        orderId: order.id,
        lines: { create: { amount, direction, categoryId } },
      },
    });
    return created.id;
  }

  async create(userId: string, businessId: string, dto: CreateOrderDto) {
    const business = await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    await this.assertAccountBelongsToBusiness(businessId, dto.accountId);

    const orderDate = assertPlausibleEntryDate(dto.orderDate);
    const deliveryDate = dto.deliveryDate ? assertPlausibleEntryDate(dto.deliveryDate) : null;
    const deliveryCharge = dto.deliveryCharge ?? 0;
    const discount = dto.discount ?? 0;
    const total = computeOrderTotal(dto.subtotal, deliveryCharge, discount);
    const status = dto.status ?? OrderStatus.NEW;
    if (status === OrderStatus.DELIVERED && total <= 0) {
      throw new BadRequestException('A delivered order needs a total above 0');
    }

    try {
      const saved = await this.prisma.$transaction(async (db) => {
        // Highest number + 1, not a row count: deleting an order never frees a number for reuse.
        const highest = await db.order.aggregate({ where: { businessId }, _max: { number: true } });
        const order = await db.order.create({
          data: {
            businessId,
            accountId: dto.accountId,
            number: (highest._max.number ?? 0) + 1,
            orderDate,
            customerName: dto.customerName,
            customerPhone: dto.customerPhone ? normalizeBdPhone(dto.customerPhone) : dto.customerPhone,
            customerEmail: dto.customerEmail,
            customerAddress: dto.customerAddress,
            items: dto.items,
            subtotal: dto.subtotal,
            deliveryCharge,
            discount,
            total,
            paymentMethod: dto.paymentMethod,
            status,
            postingRule: dto.postingRule ?? OrderPostingRule.MONEY_IN,
            deliveryDate,
            notes: dto.notes,
          },
        });
        const transactionId = await this.syncFundEntry(db, businessId, order, business);
        return { ...order, transaction: transactionId ? { id: transactionId } : null };
      });
      return this.toResponse(saved, business);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Another order was saved at the same moment. Please try again.');
      }
      throw error;
    }
  }

  async findAllForBusiness(userId: string, businessId: string) {
    const business = await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);
    const orders = await this.prisma.order.findMany({
      where: { businessId },
      orderBy: { number: 'desc' },
      include: { transaction: { select: { id: true } } },
    });
    return { summary: summarizeOrders(orders), orders: orders.map((order) => this.toResponse(order, business)) };
  }

  async findOneForBusiness(userId: string, businessId: string, id: string) {
    const business = await this.businessService.assertAccess(userId, businessId, AccessPermission.VIEW);
    return this.toResponse(await this.findOwned(businessId, id), business);
  }

  async update(userId: string, businessId: string, id: string, dto: UpdateOrderDto) {
    const business = await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    const existing = await this.findOwned(businessId, id);
    if (isFinal(existing.status)) {
      throw new ConflictException(`A ${existing.status.toLowerCase()} order is closed and can no longer be changed`);
    }
    if (dto.accountId && dto.accountId !== existing.accountId) {
      await this.assertAccountBelongsToBusiness(businessId, dto.accountId);
    }

    // Only a changed date is vetted, so an order that was saved before a rule
    // existed stays editable (same approach as ledger entries).
    const changed = (next: string | null | undefined, current: Date | null) =>
      typeof next === 'string' && new Date(next).getTime() !== current?.getTime();
    const orderDate = changed(dto.orderDate, existing.orderDate) ? assertPlausibleEntryDate(dto.orderDate as string) : undefined;
    let deliveryDate: Date | null | undefined;
    if (dto.deliveryDate === null) deliveryDate = null;
    else if (changed(dto.deliveryDate, existing.deliveryDate)) deliveryDate = assertPlausibleEntryDate(dto.deliveryDate as string);

    const subtotal = dto.subtotal ?? Number(existing.subtotal);
    const deliveryCharge = dto.deliveryCharge ?? Number(existing.deliveryCharge);
    const discount = dto.discount ?? Number(existing.discount);
    const total = computeOrderTotal(subtotal, deliveryCharge, discount);
    if (existing.status === OrderStatus.DELIVERED && total <= 0) {
      throw new BadRequestException('A delivered order needs a total above 0');
    }

    const saved = await this.prisma.$transaction(async (db) => {
      const order = await db.order.update({
        where: { id },
        data: {
          accountId: dto.accountId,
          orderDate,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone ? normalizeBdPhone(dto.customerPhone) : dto.customerPhone,
          customerEmail: dto.customerEmail,
          customerAddress: dto.customerAddress,
          items: dto.items,
          subtotal,
          deliveryCharge,
          discount,
          total,
          paymentMethod: dto.paymentMethod,
          postingRule: dto.postingRule,
          deliveryDate,
          notes: dto.notes,
        },
      });
      const transactionId =
        order.status === OrderStatus.DELIVERED ? await this.syncFundEntry(db, businessId, order, business) : null;
      return { ...order, transaction: transactionId ? { id: transactionId } : null };
    });
    return this.toResponse(saved, business);
  }

  async updateStatus(userId: string, businessId: string, id: string, dto: UpdateOrderStatusDto) {
    const business = await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    const existing = await this.findOwned(businessId, id);
    if (!canTransition(existing.status, dto.status)) {
      throw new BadRequestException(`An order that is ${existing.status.toLowerCase()} cannot be moved to ${dto.status.toLowerCase()}`);
    }

    let deliveryDate: Date | null | undefined;
    if (dto.deliveryDate === null) deliveryDate = null;
    else if (typeof dto.deliveryDate === 'string' && new Date(dto.deliveryDate).getTime() !== existing.deliveryDate?.getTime()) {
      deliveryDate = assertPlausibleEntryDate(dto.deliveryDate);
    }

    const saved = await this.prisma.$transaction(async (db) => {
      const order = await db.order.update({ where: { id }, data: { status: dto.status, deliveryDate } });
      const transactionId = await this.syncFundEntry(db, businessId, order, business);
      return { ...order, transaction: transactionId ? { id: transactionId } : null };
    });
    return this.toResponse(saved, business);
  }

  async remove(userId: string, businessId: string, id: string) {
    await this.businessService.assertAccess(userId, businessId, AccessPermission.EDIT);
    const existing = await this.findOwned(businessId, id);
    if (!isDeletable(existing.status)) {
      throw new ConflictException('This order is delivered. Move it back to shipped (or returned) first, then delete it.');
    }
    await this.prisma.$transaction(async (db) => {
      await db.transaction.deleteMany({ where: { orderId: id } });
      await db.order.delete({ where: { id } });
    });
    return { id };
  }
}

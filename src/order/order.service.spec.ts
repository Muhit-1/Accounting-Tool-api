import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccessPermission, CategoryType, LineDirection, OrderPostingRule, OrderStatus } from '../generated/prisma/client.js';
import { OrderService, ORDER_EXPENSE_CATEGORY, ORDER_INCOME_CATEGORY, summarizeOrders } from './order.service.js';

// A tiny in-memory stand-in for the parts of Prisma the order service uses, so
// posting to / removing from the fund is tested against real state instead of
// call assertions. $transaction restores the state if the callback throws,
// like the database would.
type Row = Record<string, any>;

function createFakeDb() {
  const state = {
    orders: [] as Row[],
    transactions: [] as Row[],
    categories: [] as Row[],
    accounts: [
      { id: 'fund', businessId: 'biz1' },
      { id: 'other-acc', businessId: 'biz2' },
    ] as Row[],
    seq: 0,
  };
  const nextId = (prefix: string) => `${prefix}${++state.seq}`;
  const withTransaction = (order: Row, include?: Row) => {
    const tx = state.transactions.find((t) => t.orderId === order.id);
    return include?.transaction ? { ...order, transaction: tx ? { id: tx.id } : null } : { ...order };
  };

  const db: Row = {
    order: {
      aggregate: async ({ where }: Row) => {
        const numbers = state.orders.filter((o) => o.businessId === where.businessId).map((o) => o.number);
        return { _max: { number: numbers.length ? Math.max(...numbers) : null } };
      },
      create: async ({ data }: Row) => {
        const row = { id: nextId('ord'), createdAt: new Date(), updatedAt: new Date(), ...data };
        state.orders.push(row);
        return { ...row };
      },
      findUnique: async ({ where, include }: Row) => {
        const row = state.orders.find((o) => o.id === where.id);
        return row ? withTransaction(row, include) : null;
      },
      findMany: async ({ where, include }: Row) =>
        state.orders
          .filter((o) => o.businessId === where.businessId)
          .sort((a, b) => b.number - a.number)
          .map((o) => withTransaction(o, include)),
      update: async ({ where, data }: Row) => {
        const row = state.orders.find((o) => o.id === where.id)!;
        for (const [key, value] of Object.entries(data)) if (value !== undefined) row[key] = value;
        return { ...row };
      },
      delete: async ({ where }: Row) => {
        state.orders.splice(state.orders.findIndex((o) => o.id === where.id), 1);
      },
    },
    transaction: {
      findUnique: async ({ where }: Row) => {
        const tx = state.transactions.find((t) => t.orderId === where.orderId);
        return tx ? structuredClone(tx) : null;
      },
      create: async ({ data }: Row) => {
        const { lines, ...rest } = data;
        const row = { id: nextId('tx'), ...rest, lines: [{ id: nextId('line'), ...lines.create }] };
        state.transactions.push(row);
        return structuredClone(row);
      },
      update: async ({ where, data }: Row) => {
        const row = state.transactions.find((t) => t.id === where.id)!;
        const { lines, ...rest } = data;
        Object.assign(row, rest);
        if (lines?.update) Object.assign(row.lines.find((l: Row) => l.id === lines.update.where.id), lines.update.data);
        return structuredClone(row);
      },
      delete: async ({ where }: Row) => {
        state.transactions.splice(state.transactions.findIndex((t) => t.id === where.id), 1);
      },
      deleteMany: async ({ where }: Row) => {
        state.transactions = state.transactions.filter((t) => t.orderId !== where.orderId);
      },
    },
    category: {
      findFirst: async ({ where }: Row) =>
        state.categories.find((c) => c.businessId === where.businessId && c.name === where.name && c.type === where.type) ?? null,
      create: async ({ data }: Row) => {
        const row = { id: nextId('cat'), ...data };
        state.categories.push(row);
        return { ...row };
      },
    },
    account: { findUnique: async ({ where }: Row) => state.accounts.find((a) => a.id === where.id) ?? null },
    $transaction: async (fn: (client: Row) => Promise<unknown>) => {
      const snapshot = structuredClone({ orders: state.orders, transactions: state.transactions, categories: state.categories });
      try {
        return await fn(db);
      } catch (error) {
        state.orders = snapshot.orders;
        state.transactions = snapshot.transactions;
        state.categories = snapshot.categories;
        throw error;
      }
    },
  };
  return { db, state };
}

function setup(orderPrefix: string | null = 'SJ') {
  const { db, state } = createFakeDb();
  const businessService = {
    assertAccess: vi.fn().mockResolvedValue({ id: 'biz1', name: 'Shopnojhuri', currency: 'BDT', orderPrefix }),
  };
  return { service: new OrderService(db as never, businessService as never), state, businessService };
}

const base = { accountId: 'fund', orderDate: '2026-10-05', customerName: 'Rafi A.', subtotal: 850, deliveryCharge: 100, discount: 50 };

describe('OrderService.create', () => {
  it('works the total out itself: subtotal + delivery - discount', async () => {
    const { service } = setup();
    const order = await service.create('user1', 'biz1', base);
    expect(order.total).toBe(900);
    expect(order.status).toBe(OrderStatus.NEW);
    expect(order.postingRule).toBe(OrderPostingRule.MONEY_IN);
  });

  it('adds money without float error (0.1 + 0.2)', async () => {
    const { service } = setup();
    const order = await service.create('user1', 'biz1', { ...base, subtotal: 0.1, deliveryCharge: 0.2, discount: 0 });
    expect(order.total).toBe(0.3);
  });

  it('numbers orders highest + 1 and never reuses a deleted number', async () => {
    const { service } = setup();
    const first = await service.create('user1', 'biz1', base);
    const second = await service.create('user1', 'biz1', base);
    expect([first.number, second.number]).toEqual([1, 2]);
    expect([first.displayNumber, second.displayNumber]).toEqual(['SJ-0001', 'SJ-0002']);

    await service.remove('user1', 'biz1', first.id);
    const third = await service.create('user1', 'biz1', base);
    expect(third.number).toBe(3);

    await service.remove('user1', 'biz1', third.id);
    const fourth = await service.create('user1', 'biz1', base);
    expect(fourth.number).toBe(3); // highest is now 2, so 3 again — a row count (1) would have collided
  });

  it('shows the number with initials of the name when the business has no prefix', async () => {
    const { service } = setup(null);
    expect((await service.create('user1', 'biz1', base)).displayNumber).toBe('SH-0001');
  });

  it('tidies the phone number (leading 0 restored)', async () => {
    const { service } = setup();
    expect((await service.create('user1', 'biz1', { ...base, customerPhone: '1712345678' })).customerPhone).toBe('01712345678');
    expect((await service.create('user1', 'biz1', { ...base, customerPhone: '+880 1712-345678' })).customerPhone).toBe('01712345678');
  });

  it('a new order is not money: no fund entry yet', async () => {
    const { service, state } = setup();
    await service.create('user1', 'biz1', base);
    expect(state.transactions).toHaveLength(0);
  });

  it('rejects a discount bigger than subtotal + delivery', async () => {
    const { service, state } = setup();
    await expect(service.create('user1', 'biz1', { ...base, discount: 951 })).rejects.toThrow(BadRequestException);
    expect(state.orders).toHaveLength(0);
  });

  it('allows a total of exactly 0 for an order that is not delivered', async () => {
    const { service } = setup();
    expect((await service.create('user1', 'biz1', { ...base, discount: 950 })).total).toBe(0);
  });

  it('rejects a fund account from another business', async () => {
    const { service } = setup();
    await expect(service.create('user1', 'biz1', { ...base, accountId: 'other-acc' })).rejects.toThrow(BadRequestException);
    await expect(service.create('user1', 'biz1', { ...base, accountId: 'nope' })).rejects.toThrow(BadRequestException);
  });

  it('needs EDIT access and stops before touching anything without it', async () => {
    const { service, state, businessService } = setup();
    businessService.assertAccess.mockRejectedValue(new ForbiddenException('no access'));
    await expect(service.create('viewer', 'biz1', base)).rejects.toThrow(ForbiddenException);
    expect(businessService.assertAccess).toHaveBeenCalledWith('viewer', 'biz1', AccessPermission.EDIT);
    expect(state.orders).toHaveLength(0);
  });

  it('can be entered as already delivered: the fund entry is created with it', async () => {
    const { service, state } = setup();
    const order = await service.create('user1', 'biz1', { ...base, status: OrderStatus.DELIVERED, deliveryDate: '2026-10-08' });
    expect(order.transactionId).toBe(state.transactions[0].id);
    expect(state.transactions[0]).toMatchObject({ accountId: 'fund', memo: 'Order SJ-0001', counterparty: 'Rafi A.' });
    expect(state.transactions[0].date).toEqual(new Date('2026-10-08'));
  });

  it('a delivered order with a total of 0 is refused', async () => {
    const { service, state } = setup();
    await expect(
      service.create('user1', 'biz1', { ...base, discount: 950, status: OrderStatus.DELIVERED }),
    ).rejects.toThrow(/above 0/);
    expect(state.orders).toHaveLength(0);
  });
});

describe('OrderService.updateStatus (fund entry follows the status)', () => {
  async function shippedOrder(extra: Record<string, unknown> = {}) {
    const ctx = setup();
    const order = await ctx.service.create('user1', 'biz1', { ...base, ...extra });
    await ctx.service.updateStatus('user1', 'biz1', order.id, { status: OrderStatus.CONFIRMED });
    await ctx.service.updateStatus('user1', 'biz1', order.id, { status: OrderStatus.SHIPPED });
    return { ...ctx, order };
  }

  it('walks new -> confirmed -> shipped without touching the fund', async () => {
    const { state } = await shippedOrder();
    expect(state.transactions).toHaveLength(0);
  });

  it('delivered posts MONEY IN to the fund account, dated by the delivery date', async () => {
    const { service, state, order } = await shippedOrder();

    const delivered = await service.updateStatus('user1', 'biz1', order.id, {
      status: OrderStatus.DELIVERED,
      deliveryDate: '2026-10-12',
    });

    expect(state.transactions).toHaveLength(1);
    const tx = state.transactions[0];
    expect(tx).toMatchObject({ businessId: 'biz1', accountId: 'fund', memo: 'Order SJ-0001', counterparty: 'Rafi A.', orderId: order.id });
    expect(tx.date).toEqual(new Date('2026-10-12'));
    expect(tx.lines[0]).toMatchObject({ amount: 900, direction: LineDirection.CREDIT });
    expect(state.categories.find((c) => c.id === tx.lines[0].categoryId)).toMatchObject({
      name: ORDER_INCOME_CATEGORY,
      type: CategoryType.INCOME,
    });
    expect(delivered.transactionId).toBe(tx.id);
  });

  it('uses the order date when there is no delivery date', async () => {
    const { service, state, order } = await shippedOrder();
    await service.updateStatus('user1', 'biz1', order.id, { status: OrderStatus.DELIVERED });
    expect(state.transactions[0].date).toEqual(new Date('2026-10-05'));
  });

  it('deduct-from-fund orders post MONEY OUT under their own category', async () => {
    const { service, state, order } = await shippedOrder({ postingRule: OrderPostingRule.DEDUCT_FROM_FUND });
    await service.updateStatus('user1', 'biz1', order.id, { status: OrderStatus.DELIVERED });
    expect(state.transactions[0].lines[0]).toMatchObject({ amount: 900, direction: LineDirection.DEBIT });
    expect(state.categories[0]).toMatchObject({ name: ORDER_EXPENSE_CATEGORY, type: CategoryType.EXPENSE });
  });

  it('moving back out of delivered takes the entry away again', async () => {
    const { service, state, order } = await shippedOrder();
    await service.updateStatus('user1', 'biz1', order.id, { status: OrderStatus.DELIVERED });
    expect(state.transactions).toHaveLength(1);

    const back = await service.updateStatus('user1', 'biz1', order.id, { status: OrderStatus.SHIPPED });

    expect(state.transactions).toHaveLength(0);
    expect(back.transactionId).toBeNull();
  });

  it('returned also removes the entry and is final', async () => {
    const { service, state, order } = await shippedOrder();
    await service.updateStatus('user1', 'biz1', order.id, { status: OrderStatus.DELIVERED });
    await service.updateStatus('user1', 'biz1', order.id, { status: OrderStatus.RETURNED });
    expect(state.transactions).toHaveLength(0);
    await expect(service.updateStatus('user1', 'biz1', order.id, { status: OrderStatus.DELIVERED })).rejects.toThrow(BadRequestException);
  });

  it('delivering twice keeps one entry; the category is created once and reused', async () => {
    const { service, state, order } = await shippedOrder();
    await service.updateStatus('user1', 'biz1', order.id, { status: OrderStatus.DELIVERED });
    await service.updateStatus('user1', 'biz1', order.id, { status: OrderStatus.DELIVERED, deliveryDate: '2026-10-11' });
    expect(state.transactions).toHaveLength(1);
    expect(state.transactions[0].date).toEqual(new Date('2026-10-11'));

    const second = await service.create('user1', 'biz1', { ...base, status: OrderStatus.DELIVERED });
    expect(second.transactionId).not.toBeNull();
    expect(state.categories).toHaveLength(1);
    expect(state.transactions).toHaveLength(2);
  });

  it.each([
    [OrderStatus.NEW, OrderStatus.DELIVERED],
    [OrderStatus.NEW, OrderStatus.SHIPPED],
    [OrderStatus.CONFIRMED, OrderStatus.DELIVERED],
    [OrderStatus.CONFIRMED, OrderStatus.NEW],
    [OrderStatus.SHIPPED, OrderStatus.NEW],
  ])('refuses %s -> %s', async (from, to) => {
    const { service, state } = setup();
    const order = await service.create('user1', 'biz1', base);
    state.orders[0].status = from;
    await expect(service.updateStatus('user1', 'biz1', order.id, { status: to })).rejects.toThrow(BadRequestException);
    expect(state.transactions).toHaveLength(0);
  });

  it('a cancelled order never counts and cannot be revived', async () => {
    const { service, state } = setup();
    const order = await service.create('user1', 'biz1', base);
    await service.updateStatus('user1', 'biz1', order.id, { status: OrderStatus.CANCELLED });
    expect(state.transactions).toHaveLength(0);
    await expect(service.updateStatus('user1', 'biz1', order.id, { status: OrderStatus.NEW })).rejects.toThrow(BadRequestException);
  });

  it('is all-or-nothing: a delivered order with a total of 0 is refused and the status is unchanged', async () => {
    const { service, state } = setup();
    const order = await service.create('user1', 'biz1', { ...base, discount: 950 });
    state.orders[0].status = OrderStatus.SHIPPED;

    await expect(service.updateStatus('user1', 'biz1', order.id, { status: OrderStatus.DELIVERED })).rejects.toThrow(/above 0/);

    expect(state.orders[0].status).toBe(OrderStatus.SHIPPED);
    expect(state.transactions).toHaveLength(0);
  });

  it('needs EDIT access', async () => {
    const { service, businessService, order } = await shippedOrder();
    businessService.assertAccess.mockRejectedValue(new ForbiddenException('no access'));
    await expect(service.updateStatus('viewer', 'biz1', order.id, { status: OrderStatus.DELIVERED })).rejects.toThrow(ForbiddenException);
  });

  it('cannot reach an order of another business', async () => {
    const { service, state } = setup();
    const order = await service.create('user1', 'biz1', base);
    state.orders[0].businessId = 'biz2';
    await expect(service.updateStatus('user1', 'biz1', order.id, { status: OrderStatus.CONFIRMED })).rejects.toThrow(ForbiddenException);
    await expect(service.updateStatus('user1', 'biz1', 'missing', { status: OrderStatus.CONFIRMED })).rejects.toThrow(NotFoundException);
  });
});

describe('OrderService.update', () => {
  async function deliveredOrder() {
    const ctx = setup();
    const order = await ctx.service.create('user1', 'biz1', { ...base, status: OrderStatus.DELIVERED, deliveryDate: '2026-10-08' });
    return { ...ctx, order };
  }

  it('recalculates the total from the stored figures when one changes', async () => {
    const { service } = setup();
    const order = await service.create('user1', 'biz1', base);
    expect((await service.update('user1', 'biz1', order.id, { discount: 100 })).total).toBe(850);
    expect((await service.update('user1', 'biz1', order.id, { subtotal: 1000 })).total).toBe(1000);
  });

  it('keeps a delivered order\'s fund entry in step: amount, date, account and direction', async () => {
    const { service, state, order } = await deliveredOrder();

    await service.update('user1', 'biz1', order.id, { discount: 0, deliveryDate: '2026-10-10' });
    expect(state.transactions[0].lines[0].amount).toBe(950);
    expect(state.transactions[0].date).toEqual(new Date('2026-10-10'));

    await service.update('user1', 'biz1', order.id, { postingRule: OrderPostingRule.DEDUCT_FROM_FUND });
    expect(state.transactions[0].lines[0].direction).toBe(LineDirection.DEBIT);
    expect(state.transactions).toHaveLength(1);
  });

  it('refuses to bring a delivered order down to a total of 0', async () => {
    const { service, state, order } = await deliveredOrder();
    await expect(service.update('user1', 'biz1', order.id, { discount: 950 })).rejects.toThrow(/above 0/);
    expect(state.transactions[0].lines[0].amount).toBe(900);
  });

  it('refuses a discount bigger than the order', async () => {
    const { service } = setup();
    const order = await service.create('user1', 'biz1', base);
    await expect(service.update('user1', 'biz1', order.id, { discount: 5000 })).rejects.toThrow(BadRequestException);
  });

  it('a cancelled or returned order is closed', async () => {
    const { service } = setup();
    const order = await service.create('user1', 'biz1', base);
    await service.updateStatus('user1', 'biz1', order.id, { status: OrderStatus.CANCELLED });
    await expect(service.update('user1', 'biz1', order.id, { notes: 'late' })).rejects.toThrow(ConflictException);
  });

  it('can clear optional fields with null', async () => {
    const { service } = setup();
    const order = await service.create('user1', 'biz1', { ...base, customerPhone: '01712345678', notes: 'hi' });
    const cleared = await service.update('user1', 'biz1', order.id, { customerPhone: null, notes: null });
    expect(cleared.customerPhone).toBeNull();
    expect(cleared.notes).toBeNull();
  });
});

describe('OrderService.remove', () => {
  it('deletes an order that is not delivered', async () => {
    const { service, state } = setup();
    const order = await service.create('user1', 'biz1', base);
    await expect(service.remove('user1', 'biz1', order.id)).resolves.toEqual({ id: order.id });
    expect(state.orders).toHaveLength(0);
  });

  it('will not delete a delivered order: its fund entry must be taken back first, on purpose', async () => {
    const { service, state } = setup();
    const order = await service.create('user1', 'biz1', { ...base, status: OrderStatus.DELIVERED });
    await expect(service.remove('user1', 'biz1', order.id)).rejects.toThrow(ConflictException);
    expect(state.orders).toHaveLength(1);
    expect(state.transactions).toHaveLength(1);

    await service.updateStatus('user1', 'biz1', order.id, { status: OrderStatus.SHIPPED });
    await service.remove('user1', 'biz1', order.id);
    expect(state.orders).toHaveLength(0);
    expect(state.transactions).toHaveLength(0);
  });
});

describe('OrderService reading', () => {
  it('lists newest first with the summary tiles, and needs only VIEW access', async () => {
    const { service, businessService } = setup();
    await service.create('user1', 'biz1', base);
    await service.create('user1', 'biz1', { ...base, status: OrderStatus.DELIVERED });

    const result = await service.findAllForBusiness('viewer', 'biz1');

    expect(result.orders.map((o) => o.displayNumber)).toEqual(['SJ-0002', 'SJ-0001']);
    expect(result.summary).toEqual({ orders: 2, inProgress: 1, delivered: 1, deliveredValue: 900, discountsOnDelivered: 50 });
    expect(businessService.assertAccess).toHaveBeenLastCalledWith('viewer', 'biz1', AccessPermission.VIEW);
  });

  it('returns one order', async () => {
    const { service } = setup();
    const order = await service.create('user1', 'biz1', base);
    expect((await service.findOneForBusiness('user1', 'biz1', order.id)).id).toBe(order.id);
  });
});

describe('summarizeOrders', () => {
  const row = (status: OrderStatus, total: number, discount = 0, postingRule: OrderPostingRule = OrderPostingRule.MONEY_IN) => ({
    status,
    total,
    discount,
    postingRule,
  });

  it('counts in-progress, delivered and sums exactly', () => {
    const summary = summarizeOrders([
      row(OrderStatus.NEW, 100),
      row(OrderStatus.SHIPPED, 200),
      row(OrderStatus.CANCELLED, 300),
      row(OrderStatus.RETURNED, 400),
      row(OrderStatus.DELIVERED, 0.1, 0.1),
      row(OrderStatus.DELIVERED, 0.2, 0.2),
    ]);
    expect(summary).toEqual({ orders: 6, inProgress: 2, delivered: 2, deliveredValue: 0.3, discountsOnDelivered: 0.3 });
  });

  it('leaves orders paid out of the fund out of the money figures', () => {
    const summary = summarizeOrders([
      row(OrderStatus.DELIVERED, 500, 0, OrderPostingRule.DEDUCT_FROM_FUND),
      row(OrderStatus.DELIVERED, 100, 10),
    ]);
    expect(summary).toMatchObject({ delivered: 2, deliveredValue: 100, discountsOnDelivered: 10 });
  });

  it('is zero for no orders', () => {
    expect(summarizeOrders([])).toEqual({ orders: 0, inProgress: 0, delivered: 0, deliveredValue: 0, discountsOnDelivered: 0 });
  });
});

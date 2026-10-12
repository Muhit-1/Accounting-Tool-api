import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOrderDto } from './create-order.dto.js';
import { UpdateOrderDto } from './update-order.dto.js';
import { UpdateOrderStatusDto } from './update-order-status.dto.js';
import { CreateBusinessDto } from '../../business/dto/create-business.dto.js';

// Same options as the global ValidationPipe in main.ts.
async function check<T extends object>(cls: new () => T, plain: Record<string, unknown>) {
  const instance = plainToInstance(cls, plain);
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  return { instance, errors, fields: errors.map((e) => e.property) };
}

const order = { accountId: 'a1', orderDate: '2026-10-05', customerName: 'Rafi A.', subtotal: 850 };

describe('CreateOrderDto', () => {
  it('accepts a minimal order and a full one', async () => {
    expect((await check(CreateOrderDto, order)).errors).toEqual([]);
    const full = {
      ...order,
      customerPhone: '+880 1712-345678',
      customerEmail: 'rafi@example.com',
      customerAddress: 'House 1, Road 2, Dhaka',
      items: 'Stacking rings x 2',
      deliveryCharge: 100,
      discount: 50.5,
      paymentMethod: 'bKash',
      status: 'SHIPPED',
      postingRule: 'DEDUCT_FROM_FUND',
      deliveryDate: '2026-10-13',
      notes: 'Call first',
    };
    expect((await check(CreateOrderDto, full)).errors).toEqual([]);
  });

  it('never accepts a total from the client — the server works it out', async () => {
    expect((await check(CreateOrderDto, { ...order, total: 1 })).fields).toContain('total');
  });

  it('needs a customer name, and trims it', async () => {
    expect((await check(CreateOrderDto, { ...order, customerName: '   ' })).fields).toContain('customerName');
    const { instance } = await check(CreateOrderDto, { ...order, customerName: '  Rafi A.  ' });
    expect(instance.customerName).toBe('Rafi A.');
    expect((await check(CreateOrderDto, { ...order, customerName: 'x'.repeat(121) })).fields).toContain('customerName');
  });

  it('only allows phone characters, up to 30', async () => {
    expect((await check(CreateOrderDto, { ...order, customerPhone: 'call me' })).fields).toContain('customerPhone');
    expect((await check(CreateOrderDto, { ...order, customerPhone: '<script>' })).fields).toContain('customerPhone');
    expect((await check(CreateOrderDto, { ...order, customerPhone: '1'.repeat(31) })).fields).toContain('customerPhone');
  });

  it('turns empty optional text into null', async () => {
    const { errors, instance } = await check(CreateOrderDto, { ...order, customerPhone: ' ', customerEmail: '', notes: '  ', items: '' });
    expect(errors).toEqual([]);
    expect([instance.customerPhone, instance.customerEmail, instance.notes, instance.items]).toEqual([null, null, null, null]);
  });

  it('checks the email', async () => {
    expect((await check(CreateOrderDto, { ...order, customerEmail: 'not-an-email' })).fields).toContain('customerEmail');
  });

  it('keeps money in range: not negative, at most 2 decimals, not huge, not text', async () => {
    for (const subtotal of [-1, 10.123, 10_000_000_000, '850', Number.NaN]) {
      expect((await check(CreateOrderDto, { ...order, subtotal })).fields).toContain('subtotal');
    }
    expect((await check(CreateOrderDto, { ...order, deliveryCharge: -5 })).fields).toContain('deliveryCharge');
    expect((await check(CreateOrderDto, { ...order, discount: -5 })).fields).toContain('discount');
    expect((await check(CreateOrderDto, { ...order, subtotal: 0 })).errors).toEqual([]);
  });

  it('only knows the real statuses and posting rules', async () => {
    expect((await check(CreateOrderDto, { ...order, status: 'DONE' })).fields).toContain('status');
    expect((await check(CreateOrderDto, { ...order, postingRule: 'GIFT' })).fields).toContain('postingRule');
  });

  it('limits the long fields', async () => {
    expect((await check(CreateOrderDto, { ...order, items: 'x'.repeat(2001) })).fields).toContain('items');
    expect((await check(CreateOrderDto, { ...order, customerAddress: 'x'.repeat(501) })).fields).toContain('customerAddress');
    expect((await check(CreateOrderDto, { ...order, notes: 'x'.repeat(1001) })).fields).toContain('notes');
    expect((await check(CreateOrderDto, { ...order, paymentMethod: 'x'.repeat(61) })).fields).toContain('paymentMethod');
  });

  it('wants real dates', async () => {
    expect((await check(CreateOrderDto, { ...order, orderDate: 'yesterday' })).fields).toContain('orderDate');
    expect((await check(CreateOrderDto, { ...order, deliveryDate: 'soon' })).fields).toContain('deliveryDate');
  });
});

describe('UpdateOrderDto', () => {
  it('takes any subset, and can clear the delivery date and optional text', async () => {
    expect((await check(UpdateOrderDto, {})).errors).toEqual([]);
    expect((await check(UpdateOrderDto, { discount: 10 })).errors).toEqual([]);
    expect((await check(UpdateOrderDto, { deliveryDate: null, customerPhone: null, notes: '' })).errors).toEqual([]);
  });

  it('does not change the status — that has its own endpoint', async () => {
    expect((await check(UpdateOrderDto, { status: 'DELIVERED' })).fields).toContain('status');
  });

  it('still refuses a total', async () => {
    expect((await check(UpdateOrderDto, { total: 5 })).fields).toContain('total');
  });
});

describe('UpdateOrderStatusDto', () => {
  it('takes a status and an optional delivery date', async () => {
    expect((await check(UpdateOrderStatusDto, { status: 'DELIVERED', deliveryDate: '2026-10-13' })).errors).toEqual([]);
    expect((await check(UpdateOrderStatusDto, { status: 'SHIPPED' })).errors).toEqual([]);
  });

  it('refuses a missing or unknown status', async () => {
    expect((await check(UpdateOrderStatusDto, {})).fields).toContain('status');
    expect((await check(UpdateOrderStatusDto, { status: 'PAID' })).fields).toContain('status');
  });
});

describe('Business.orderPrefix', () => {
  const business = { name: 'Shopnojhuri' };

  it('is optional, upper-cased and trimmed', async () => {
    expect((await check(CreateBusinessDto, business)).errors).toEqual([]);
    const { errors, instance } = await check(CreateBusinessDto, { ...business, orderPrefix: ' sj ' });
    expect(errors).toEqual([]);
    expect(instance.orderPrefix).toBe('SJ');
  });

  it('empty clears it', async () => {
    const { errors, instance } = await check(CreateBusinessDto, { ...business, orderPrefix: '  ' });
    expect(errors).toEqual([]);
    expect(instance.orderPrefix).toBeNull();
  });

  it('allows letters and digits up to 10, nothing else', async () => {
    expect((await check(CreateBusinessDto, { ...business, orderPrefix: 'ABCDEFGHIJ' })).errors).toEqual([]);
    expect((await check(CreateBusinessDto, { ...business, orderPrefix: 'ABCDEFGHIJK' })).fields).toContain('orderPrefix');
    expect((await check(CreateBusinessDto, { ...business, orderPrefix: 'S-J' })).fields).toContain('orderPrefix');
    expect((await check(CreateBusinessDto, { ...business, orderPrefix: 'S J' })).fields).toContain('orderPrefix');
  });
});

import { OrderStatus } from '../generated/prisma/client.js';
import { normalizeBdPhone } from '../common/phone.js';
import { ALLOWED_ORDER_TRANSITIONS, canTransition, isDeletable, isFinal, isInProgress } from './order-status.js';
import { defaultOrderPrefix, formatOrderNumber } from './order-number.js';

const ALL = Object.values(OrderStatus);

describe('order status table', () => {
  it('covers every status', () => {
    expect(Object.keys(ALLOWED_ORDER_TRANSITIONS).sort()).toEqual([...ALL].sort());
  });

  it.each([
    ['NEW', 'CONFIRMED'],
    ['NEW', 'CANCELLED'],
    ['CONFIRMED', 'SHIPPED'],
    ['CONFIRMED', 'CANCELLED'],
    ['SHIPPED', 'DELIVERED'],
    ['SHIPPED', 'CANCELLED'],
    ['DELIVERED', 'SHIPPED'],
    ['DELIVERED', 'RETURNED'],
  ] as const)('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ['NEW', 'DELIVERED'],
    ['NEW', 'SHIPPED'],
    ['NEW', 'RETURNED'],
    ['CONFIRMED', 'NEW'],
    ['CONFIRMED', 'DELIVERED'],
    ['SHIPPED', 'NEW'],
    ['SHIPPED', 'RETURNED'],
    ['DELIVERED', 'CANCELLED'],
    ['DELIVERED', 'NEW'],
    ['CANCELLED', 'NEW'],
    ['CANCELLED', 'DELIVERED'],
    ['RETURNED', 'DELIVERED'],
    ['RETURNED', 'SHIPPED'],
  ] as const)('refuses %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it('staying where you are is always fine', () => {
    for (const status of ALL) expect(canTransition(status, status)).toBe(true);
  });

  it('only cancelled and returned are final', () => {
    expect(ALL.filter(isFinal)).toEqual(['CANCELLED', 'RETURNED']);
    expect(ALL.filter((s) => ALLOWED_ORDER_TRANSITIONS[s].length === 0)).toEqual(['CANCELLED', 'RETURNED']);
  });

  it('only delivered orders cannot be deleted', () => {
    expect(ALL.filter((s) => !isDeletable(s))).toEqual(['DELIVERED']);
  });

  it('new, confirmed and shipped are in progress', () => {
    expect(ALL.filter(isInProgress)).toEqual(['NEW', 'CONFIRMED', 'SHIPPED']);
  });
});

describe('order numbers', () => {
  it('pads to four digits after the prefix', () => {
    expect(formatOrderNumber('SJ', 'Shopnojhuri', 3)).toBe('SJ-0003');
    expect(formatOrderNumber('SJ', 'Shopnojhuri', 12345)).toBe('SJ-12345');
  });

  it('falls back to initials when there is no prefix', () => {
    expect(formatOrderNumber(null, 'Shopno Jhuri', 1)).toBe('SJ-0001');
    expect(formatOrderNumber('  ', 'Shopnojhuri', 1)).toBe('SH-0001');
  });

  it('builds a default prefix from odd names', () => {
    expect(defaultOrderPrefix('SAM Trek')).toBe('ST');
    expect(defaultOrderPrefix('a')).toBe('A');
    expect(defaultOrderPrefix('  ')).toBe('OR');
    expect(defaultOrderPrefix('---')).toBe('OR');
    expect(defaultOrderPrefix('Vaaii')).toBe('VA');
  });
});

describe('normalizeBdPhone', () => {
  it.each([
    ['1712345678', '01712345678'], // Google Forms dropped the leading 0
    ['01712345678', '01712345678'],
    ['+8801712345678', '01712345678'],
    ['8801712345678', '01712345678'],
    ['+880 1712-345678', '01712345678'],
    ['(017) 1234 5678', '01712345678'],
    ['  01712345678  ', '01712345678'],
    ['1912345678', '01912345678'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeBdPhone(input)).toBe(expected);
  });

  it.each([
    ['+14155552671', '+14155552671'], // another country's number
    ['5551234567', '5551234567'], // not a Bangladesh mobile pattern
    ['0171234567', '0171234567'], // too short
    ['017123456789', '017123456789'], // too long
    ['1212345678', '1212345678'], // 12 is not a mobile operator prefix
    ['call after 5', 'call after 5'],
    ['', ''],
  ])('leaves %s as typed', (input, expected) => {
    expect(normalizeBdPhone(input)).toBe(expected);
  });
});

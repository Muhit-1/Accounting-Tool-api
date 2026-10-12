import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTransactionDto } from '../transaction/dto/create-transaction.dto.js';
import { UpdateTransactionDto } from '../transaction/dto/update-transaction.dto.js';
import { CreateCategoryDto } from '../category/dto/create-category.dto.js';
import { UpdateCategoryDto } from '../category/dto/update-category.dto.js';
import { MonthlyQueryDto } from '../report/dto/monthly-query.dto.js';
import { isHttpsUrl } from './validators.js';

// Same options as the global ValidationPipe in main.ts.
async function check<T extends object>(cls: new () => T, plain: Record<string, unknown>) {
  const instance = plainToInstance(cls, plain);
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  return { instance, errors, fields: errors.map((e) => e.property) };
}

const tx = { accountId: 'a1', date: '2026-01-01', type: 'EXPENSE', amount: 10 };

describe('proofUrl', () => {
  it.each([
    'https://drive.google.com/file/d/abc/view',
    'https://example.com/a.png?x=1&y=2#frag',
    'https://sub.example.co.uk:8443/path',
  ])('accepts %s', async (proofUrl) => {
    const { errors, instance } = await check(CreateTransactionDto, { ...tx, proofUrl });
    expect(errors).toEqual([]);
    expect(instance.proofUrl).toBe(proofUrl);
  });

  it.each([
    ['http', 'http://example.com/a.png'],
    ['javascript:', 'javascript:alert(1)'],
    ['JavaScript: in capitals', 'JAVASCRIPT:alert(1)'],
    ['data:', 'data:text/html;base64,PHNjcmlwdD4='],
    ['a space inside', 'https://example.com/a b.png'],
    ['a newline inside', 'https://example.com/a\nb'],
    ['no scheme', 'example.com/a.png'],
    ['ftp', 'ftp://example.com/a'],
    ['a name:password in front of the host', 'https://user:pass@example.com/a'],
    ['no host', 'https://'],
  ])('rejects %s', async (_name, proofUrl) => {
    const { fields } = await check(CreateTransactionDto, { ...tx, proofUrl });
    expect(fields).toContain('proofUrl');
  });

  it('rejects a link over 2000 characters and accepts one at 2000', async () => {
    const prefix = 'https://example.com/';
    const atLimit = prefix + 'a'.repeat(2000 - prefix.length);
    expect((await check(CreateTransactionDto, { ...tx, proofUrl: atLimit })).errors).toEqual([]);
    expect((await check(CreateTransactionDto, { ...tx, proofUrl: atLimit + 'a' })).fields).toContain('proofUrl');
  });

  it('trims a link with spaces around it', async () => {
    const { errors, instance } = await check(CreateTransactionDto, { ...tx, proofUrl: '  https://example.com/x  ' });
    expect(errors).toEqual([]);
    expect(instance.proofUrl).toBe('https://example.com/x');
  });

  it('turns an empty or spaces-only value into null (no link) instead of storing it', async () => {
    for (const proofUrl of ['', '   ', '\t']) {
      const { errors, instance } = await check(CreateTransactionDto, { ...tx, proofUrl });
      expect(errors).toEqual([]);
      expect(instance.proofUrl).toBeNull();
    }
  });

  it('can be left out and can be cleared with null on an update', async () => {
    expect((await check(CreateTransactionDto, tx)).errors).toEqual([]);
    expect((await check(UpdateTransactionDto, { proofUrl: null })).errors).toEqual([]);
  });

  it('the plain validator also rejects empty-with-spaces and non-strings', () => {
    expect(isHttpsUrl('   ')).toBe(false);
    expect(isHttpsUrl('')).toBe(false);
    expect(isHttpsUrl(42)).toBe(false);
    expect(isHttpsUrl(undefined)).toBe(false);
  });
});

describe('amount type fields', () => {
  it('keeps requiring an amount for a plain entry, as before', async () => {
    const { amount: _amount, ...withoutAmount } = tx;
    expect((await check(CreateTransactionDto, withoutAmount)).fields).toContain('amount');
    expect((await check(CreateTransactionDto, { ...withoutAmount, amountType: 'FIXED' })).fields).toContain('amount');
    expect((await check(CreateTransactionDto, { ...tx, amount: 0 })).fields).toContain('amount');
  });

  it('does not need an amount for a calculated type', async () => {
    const { amount: _amount, ...withoutAmount } = tx;
    const dto = { ...withoutAmount, amountType: 'MULTIPLY', amountInputs: [1000, 5] };
    expect((await check(CreateTransactionDto, dto)).errors).toEqual([]);
  });

  it('rejects an unknown amountType', async () => {
    expect((await check(CreateTransactionDto, { ...tx, amountType: 'POWER' })).fields).toContain('amountType');
    expect((await check(CreateTransactionDto, { ...tx, amountType: 'multiply' })).fields).toContain('amountType');
  });

  it('accepts up to 10 boxes and rejects 11 or none', async () => {
    const dto = { ...tx, amountType: 'SUM' };
    expect((await check(CreateTransactionDto, { ...dto, amountInputs: Array(10).fill(1) })).errors).toEqual([]);
    expect((await check(CreateTransactionDto, { ...dto, amountInputs: Array(11).fill(1) })).fields).toContain('amountInputs');
    expect((await check(CreateTransactionDto, { ...dto, amountInputs: [] })).fields).toContain('amountInputs');
  });

  it('rejects text, null, NaN and huge numbers in the boxes', async () => {
    const dto = { ...tx, amountType: 'SUM' };
    for (const amountInputs of [['5', 1], [null, 1], [Number.NaN, 1], [1_000_000_001, 1], [-1_000_000_001, 1], '1+2']) {
      expect((await check(CreateTransactionDto, { ...dto, amountInputs })).fields).toContain('amountInputs');
    }
  });

  it('refuses unknown properties (no formula or expression field can sneak in)', async () => {
    expect((await check(CreateTransactionDto, { ...tx, formula: '1+1' })).fields).toContain('formula');
  });
});

describe('category groupName', () => {
  const category = { name: 'Transport', type: 'EXPENSE' };

  it('is optional', async () => {
    expect((await check(CreateCategoryDto, category)).errors).toEqual([]);
  });

  it('is trimmed', async () => {
    const { errors, instance } = await check(CreateCategoryDto, { ...category, groupName: '  Overhead  ' });
    expect(errors).toEqual([]);
    expect(instance.groupName).toBe('Overhead');
  });

  it('turns empty or spaces-only into null', async () => {
    for (const groupName of ['', '   ']) {
      const { errors, instance } = await check(CreateCategoryDto, { ...category, groupName });
      expect(errors).toEqual([]);
      expect(instance.groupName).toBeNull();
    }
  });

  it('allows 60 characters and rejects 61', async () => {
    expect((await check(CreateCategoryDto, { ...category, groupName: 'x'.repeat(60) })).errors).toEqual([]);
    expect((await check(CreateCategoryDto, { ...category, groupName: 'x'.repeat(61) })).fields).toContain('groupName');
  });

  it('rejects a trimmed value that is still too long, and a non-string', async () => {
    expect((await check(CreateCategoryDto, { ...category, groupName: ` ${'x'.repeat(61)} ` })).fields).toContain('groupName');
    expect((await check(CreateCategoryDto, { ...category, groupName: 5 })).fields).toContain('groupName');
  });

  it('can be cleared with null on an update', async () => {
    const { errors, instance } = await check(UpdateCategoryDto, { groupName: null });
    expect(errors).toEqual([]);
    expect(instance.groupName).toBeNull();
  });
});

describe('monthly query', () => {
  it('accepts a normal request and the 1..36 months limits', async () => {
    expect((await check(MonthlyQueryDto, { start: '2026-05', months: '12', accountId: 'a1' })).errors).toEqual([]);
    expect((await check(MonthlyQueryDto, { months: '1' })).errors).toEqual([]);
    expect((await check(MonthlyQueryDto, { months: '36' })).errors).toEqual([]);
    expect((await check(MonthlyQueryDto, {})).errors).toEqual([]);
  });

  it.each(['0', '37', '-1', '1.5', 'abc'])('rejects months=%s', async (months) => {
    expect((await check(MonthlyQueryDto, { months })).fields).toContain('months');
  });

  it.each(['2026-13', '2026-00', '2026-5', '26-05', '2026/05', '1999-12', '2026-05-01', 'May 2026'])(
    'rejects start=%s',
    async (start) => {
      expect((await check(MonthlyQueryDto, { start })).fields).toContain('start');
    },
  );
});

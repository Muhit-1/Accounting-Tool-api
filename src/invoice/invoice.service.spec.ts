import { ConflictException } from '@nestjs/common';
import { InvoiceService } from './invoice.service.js';
import { AccessPermission, Prisma } from '../generated/prisma/client.js';

const STAGED = { stagedPath: '/data/invoices/biz1/inv1.pdf.abc.tmp', finalPath: '/data/invoices/biz1/inv1.pdf' };

// Records the order in which the collaborators are called, because the whole
// point of InvoiceService.update is "render and stage first, commit the
// database second, move the file last".
function setup() {
  const calls: string[] = [];

  const existing = {
    id: 'inv1',
    businessId: 'biz1',
    clientId: 'client1',
    number: '100',
    issueDate: new Date('2026-08-01'),
    terms: 'Due end of month',
    dueDate: new Date('2026-08-31'),
    subTotal: 50,
    total: 50,
    fileReference: STAGED.finalPath,
    client: { id: 'client1', name: 'Acme', address: 'Somewhere' },
    items: [{ description: 'Old work', quantity: 1, rate: 50, amount: 50 }],
  };

  const tx = {
    invoiceItem: { deleteMany: vi.fn() },
    invoice: { update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...existing, ...data, items: [] })) },
  };
  const prisma = {
    invoice: { findUnique: vi.fn().mockResolvedValue(existing) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => {
      calls.push('db');
      return fn(tx);
    }),
  };
  const businessService = { assertAccess: vi.fn().mockResolvedValue({ name: 'Test Co', currency: 'BDT' }) };
  const clientService = { findOneForBusiness: vi.fn() };
  const pdfService = {
    render: vi.fn(async () => {
      calls.push('render');
      return Buffer.from('pdf');
    }),
  };
  const storageService = {
    stage: vi.fn(async () => {
      calls.push('stage');
      return STAGED;
    }),
    commit: vi.fn(async () => {
      calls.push('commit');
    }),
    discard: vi.fn(async () => {
      calls.push('discard');
    }),
  };

  const service = new InvoiceService(
    prisma as never,
    businessService as never,
    clientService as never,
    pdfService as never,
    storageService as never,
  );
  return { service, calls, prisma, tx, businessService, pdfService, storageService, existing };
}

const dto = { items: [{ description: 'New work', quantity: 2, rate: 30 }] };

describe('InvoiceService.update', () => {
  it('renders and stages the PDF before the database write, and moves the file last', async () => {
    const { service, calls, tx } = setup();

    const result = await service.update('user1', 'biz1', 'inv1', dto as never);

    expect(calls).toEqual(['render', 'stage', 'db', 'commit']);
    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ total: 60, fileReference: STAGED.finalPath }) }),
    );
    expect(result.total).toBe(60);
  });

  it('requires EDIT access to the business', async () => {
    const { service, businessService } = setup();

    await service.update('user1', 'biz1', 'inv1', dto as never);

    expect(businessService.assertAccess).toHaveBeenCalledWith('user1', 'biz1', AccessPermission.EDIT);
  });

  it('leaves the database and the old PDF untouched when rendering fails', async () => {
    const { service, prisma, pdfService, storageService } = setup();
    pdfService.render.mockRejectedValueOnce(new Error('Chromium crashed'));

    await expect(service.update('user1', 'biz1', 'inv1', dto as never)).rejects.toThrow('Chromium crashed');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(storageService.stage).not.toHaveBeenCalled();
    expect(storageService.commit).not.toHaveBeenCalled();
  });

  it('discards the staged file and keeps the old PDF when the database rejects the update', async () => {
    const { service, calls, prisma, storageService } = setup();
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );

    await expect(service.update('user1', 'biz1', 'inv1', { number: '200' } as never)).rejects.toThrow(
      ConflictException,
    );

    expect(calls).toEqual(['render', 'stage', 'discard']);
    expect(storageService.commit).not.toHaveBeenCalled();
  });

  it('restores the previous content if moving the file into place fails', async () => {
    const { service, prisma, tx, storageService } = setup();
    storageService.commit.mockRejectedValueOnce(new Error('disk full'));

    await expect(service.update('user1', 'biz1', 'inv1', dto as never)).rejects.toThrow('disk full');

    // One transaction for the new content, a second one putting the old back.
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.invoice.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ number: '100', total: 50 }) }),
    );
    expect(storageService.discard).toHaveBeenCalled();
  });
});

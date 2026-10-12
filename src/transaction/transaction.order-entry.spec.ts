import { ConflictException } from '@nestjs/common';
import { TransactionService } from './transaction.service.js';
import { LineDirection } from '../generated/prisma/client.js';

// An entry posted by a delivered order belongs to that order: the books and
// the order would disagree if it were edited, deleted or given a receipt here.
function setup(orderId: string | null) {
  const stored = {
    id: 'tx1',
    businessId: 'biz1',
    orderId,
    date: new Date('2026-10-05'),
    memo: 'Order SJ-0001',
    counterparty: 'Rafi A.',
    receiptFileName: null,
    receiptFileReference: null,
    createdAt: new Date(),
    lines: [{ id: 'line1', amount: 900, direction: LineDirection.CREDIT, categoryId: null, category: null }],
  };
  const prisma = {
    transaction: {
      findUnique: vi.fn().mockResolvedValue(stored),
      update: vi.fn().mockResolvedValue(stored),
      delete: vi.fn(),
    },
    account: { findUnique: vi.fn().mockResolvedValue({ id: 'a1', businessId: 'biz1' }) },
    category: { findUnique: vi.fn() },
  };
  const businessService = { assertAccess: vi.fn().mockResolvedValue({ id: 'biz1' }) };
  const receiptStorage = { save: vi.fn(), read: vi.fn(), remove: vi.fn() };
  return { service: new TransactionService(prisma as never, businessService as never, receiptStorage as never), prisma, receiptStorage };
}

describe('entries owned by an order', () => {
  it('cannot be edited', async () => {
    const { service, prisma } = setup('ord1');
    await expect(service.update('user1', 'biz1', 'tx1', { memo: 'changed' })).rejects.toThrow(ConflictException);
    await expect(service.update('user1', 'biz1', 'tx1', { amount: 1 })).rejects.toThrow(/Change the order/);
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });

  it('cannot be deleted', async () => {
    const { service, prisma } = setup('ord1');
    await expect(service.remove('user1', 'biz1', 'tx1')).rejects.toThrow(ConflictException);
    expect(prisma.transaction.delete).not.toHaveBeenCalled();
  });

  it('cannot get a receipt file attached', async () => {
    const { service, receiptStorage } = setup('ord1');
    const file = { mimetype: 'application/pdf', size: 10, originalname: 'a.pdf', buffer: Buffer.from('%PDF-1.4') };
    await expect(service.attachReceipt('user1', 'biz1', 'tx1', file)).rejects.toThrow(ConflictException);
    expect(receiptStorage.save).not.toHaveBeenCalled();
  });

  it('is shown with its orderId so clients can tell', async () => {
    const { service } = setup('ord1');
    expect((await service.findOneForBusiness('user1', 'biz1', 'tx1')).orderId).toBe('ord1');
  });

  it('ordinary entries are unaffected', async () => {
    const { service, prisma } = setup(null);
    await service.update('user1', 'biz1', 'tx1', { memo: 'changed' });
    await service.remove('user1', 'biz1', 'tx1');
    expect(prisma.transaction.update).toHaveBeenCalledTimes(1);
    expect(prisma.transaction.delete).toHaveBeenCalledTimes(1);
    expect((await service.findOneForBusiness('user1', 'biz1', 'tx1')).orderId).toBeNull();
  });
});

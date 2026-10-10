import { InvoiceStatus } from '../generated/prisma/client.js';

// An invoice is a document sent to a customer, so its life runs one way: draft
// -> sent -> paid, with cancellation as the only way to withdraw it. PAID can
// step back to SENT so a mis-click is recoverable. CANCELLED is final — issue
// a new invoice instead of reviving one the customer may have been told is void.
// The web app mirrors this map (accounting-web/src/lib/invoices.ts); keep both in step.
export const ALLOWED_STATUS_TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  [InvoiceStatus.DRAFT]: [InvoiceStatus.SENT, InvoiceStatus.CANCELLED],
  [InvoiceStatus.SENT]: [InvoiceStatus.PAID, InvoiceStatus.OVERDUE, InvoiceStatus.CANCELLED],
  [InvoiceStatus.OVERDUE]: [InvoiceStatus.PAID, InvoiceStatus.SENT, InvoiceStatus.CANCELLED],
  [InvoiceStatus.PAID]: [InvoiceStatus.SENT],
  [InvoiceStatus.CANCELLED]: [],
};

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return from === to || ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}

// Only a draft may still change; once sent, the PDF the customer holds is the record.
export function isEditable(status: InvoiceStatus): boolean {
  return status === InvoiceStatus.DRAFT;
}

// A sent or paid invoice is a financial record; withdraw it (CANCELLED) rather than erase it.
export function isDeletable(status: InvoiceStatus): boolean {
  return status === InvoiceStatus.DRAFT || status === InvoiceStatus.CANCELLED;
}

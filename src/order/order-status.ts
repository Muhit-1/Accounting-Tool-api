import { OrderStatus } from '../generated/prisma/client.js';

// An order moves forward (new -> confirmed -> shipped -> delivered) and can be
// cancelled until it is delivered. A delivered order can step back to SHIPPED
// (a mis-click) or be RETURNED. CANCELLED and RETURNED are final.
// Only DELIVERED orders are money: entering that status posts the order to the
// fund, leaving it removes the entry again (see OrderService).
// The web app mirrors this map (accounting-web/src/lib/order-status.ts); keep both in step.
export const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatus.NEW]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [OrderStatus.SHIPPED, OrderStatus.RETURNED],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.RETURNED]: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return from === to || ALLOWED_ORDER_TRANSITIONS[from].includes(to);
}

// A final order is a closed record: it no longer changes.
export function isFinal(status: OrderStatus): boolean {
  return status === OrderStatus.CANCELLED || status === OrderStatus.RETURNED;
}

// A delivered order owns a fund entry; move it out of DELIVERED first so the
// entry is taken back deliberately, not as a side effect of a delete.
export function isDeletable(status: OrderStatus): boolean {
  return status !== OrderStatus.DELIVERED;
}

export function isInProgress(status: OrderStatus): boolean {
  return status === OrderStatus.NEW || status === OrderStatus.CONFIRMED || status === OrderStatus.SHIPPED;
}

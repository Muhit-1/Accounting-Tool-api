// Defense in depth for on-disk storage paths built from route params
// (businessId/transactionId/invoiceId): these only reach the storage
// services after a DB-backed assertAccess/ownership check already
// confirmed they're real records the caller can see, so this shouldn't be
// reachable with a hostile value today — but it costs nothing to make
// path traversal structurally impossible regardless of future call sites.
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export function isSafeId(id: string): boolean {
  return SAFE_ID_PATTERN.test(id);
}

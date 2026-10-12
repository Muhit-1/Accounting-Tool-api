// "SJ-0003": the business's prefix, a dash, the order's number padded to four
// digits. The number itself is stored as a plain integer (highest + 1 per
// business, never a row count, so deleting an order never reuses a number).

// Initials of the first two words ("Shopno Jhuri" -> "SJ"); a single word gives
// its first two letters ("Shopnojhuri" -> "SH"). Only letters and digits count.
export function defaultOrderPrefix(businessName: string): string {
  const words = businessName
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean);
  if (words.length === 0) return 'OR';
  const letters = words.length >= 2 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return letters.toUpperCase();
}

export function formatOrderNumber(prefix: string | null | undefined, businessName: string, number: number): string {
  const label = prefix?.trim() || defaultOrderPrefix(businessName);
  return `${label}-${String(number).padStart(4, '0')}`;
}

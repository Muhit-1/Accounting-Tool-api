// Bangladesh mobile numbers, as customers and Google Forms deliver them:
// a Form stores the number as a plain number, so "01712345678" arrives as
// "1712345678" and the leading 0 is lost. Put it back, and drop a +880 / 880
// country code, so every number is stored the same way (01XXXXXXXXX).
// Anything that does not clearly look like one of these is returned as typed
// (trimmed) rather than guessed at.
export function normalizeBdPhone(value: string): string {
  const typed = value.trim();
  const compact = typed.replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(compact)) return typed;

  let digits = compact.startsWith('+') ? compact.slice(1) : compact;
  if (digits.startsWith('880') && digits.length === 13) digits = digits.slice(2); // 8801712345678 -> 1712345678
  else if (compact.startsWith('+')) return typed; // some other country's number

  if (/^01[3-9]\d{8}$/.test(digits)) return digits; // already 01XXXXXXXXX
  if (/^1[3-9]\d{8}$/.test(digits)) return `0${digits}`; // leading 0 was dropped
  return typed;
}

import { Matches, ValidateBy, type ValidationOptions } from 'class-validator';
import { Transform } from 'class-transformer';

// Logos are stored inline as base64 data URIs (see Business.logoUrl) — never
// remote URLs, which the PDF renderer would otherwise be asked to fetch.
// SVG is excluded on purpose (can embed scripts/external references).
export const LOGO_DATA_URI_PATTERN = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
export const MAX_LOGO_DATA_URI_LENGTH = 800_000;

export const IsLogoDataUri = () =>
  Matches(LOGO_DATA_URI_PATTERN, { message: 'logoUrl must be a base64 PNG, JPEG, WEBP or GIF data URI' });

// Emails are case-insensitive in practice; normalize so "A@x.com" and
// "a@x.com" can't register as two accounts or fail to log in.
export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

// Optional free-text fields: trim, and treat "" / "   " as "not set" (null) so
// a form that clears the box can clear the stored value too. null passes
// through IsOptional, undefined still means "leave as is" on updates.
export const TrimToNull = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  });

export const MAX_PROOF_URL_LENGTH = 2000;

// A proof link is only ever opened by a person clicking it, so the rule is
// about what it may point at: https only (no javascript:, data:, http:), no
// whitespace or control characters, no user:password@ in front of the host.
export function isHttpsUrl(value: unknown, maxLength = MAX_PROOF_URL_LENGTH): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && url.hostname !== '' && url.username === '' && url.password === '';
}

export const IsHttpsUrl = (options?: ValidationOptions) =>
  ValidateBy(
    {
      name: 'isHttpsUrl',
      validator: {
        validate: (value: unknown) => isHttpsUrl(value),
        defaultMessage: () => 'Proof link must be a web address starting with https:// (no spaces), up to 2000 characters',
      },
    },
    options,
  );

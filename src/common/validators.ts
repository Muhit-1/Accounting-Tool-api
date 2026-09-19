import { Matches } from 'class-validator';
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

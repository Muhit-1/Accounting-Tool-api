import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// The `state` parameter is a signed, short-lived token, and the browser also
// keeps a matching httpOnly cookie. Both must agree on the callback, which
// proves the browser finishing the login is the one that started it (login
// CSRF defence). Signed with an HMAC keyed by JWT_SECRET; the label keeps a
// state token from ever being valid as anything else signed with that secret.

export const STATE_TTL_MS = 10 * 60_000;
const SIGNING_LABEL = 'google-oauth-state.v1.';

export interface OAuthState {
  // Random per-flow value; also sent to Google as the OIDC `nonce`.
  n: string;
  // Expiry, epoch milliseconds.
  exp: number;
  // True on the single automatic restart that asks for a refresh token.
  r: boolean;
}

const b64url = (buf: Buffer) => buf.toString('base64url');

function sign(secret: string, body: string): Buffer {
  return createHmac('sha256', secret)
    .update(SIGNING_LABEL + body)
    .digest();
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function createState(
  secret: string,
  options: { retry: boolean; now?: number; nonce?: string },
): { token: string; nonce: string } {
  const nonce = options.nonce ?? randomToken(24);
  const payload: OAuthState = { n: nonce, exp: (options.now ?? Date.now()) + STATE_TTL_MS, r: options.retry };
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  return { token: `${body}.${b64url(sign(secret, body))}`, nonce };
}

// null for anything that is not a valid, unexpired token we signed.
export function verifyState(secret: string, token: string, now = Date.now()): OAuthState | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const given = Buffer.from(signature, 'base64url');
  const expected = sign(secret, body);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;
  const { n, exp, r } = payload as Record<string, unknown>;
  if (typeof n !== 'string' || n === '' || typeof exp !== 'number' || typeof r !== 'boolean') return null;
  if (exp <= now) return null;
  return { n, exp, r };
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

// PKCE (RFC 7636), S256.
export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomToken(32);
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

// The flow cookie holds "<nonce>.<pkce verifier>". Both parts are base64url,
// so the dot is unambiguous.
export function buildFlowCookie(nonce: string, verifier: string): string {
  return `${nonce}.${verifier}`;
}

export function parseFlowCookie(value: string | null): { nonce: string; verifier: string } | null {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { nonce: parts[0], verifier: parts[1] };
}

// Minimal Cookie-header lookup; avoids adding cookie-parser for one cookie.
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

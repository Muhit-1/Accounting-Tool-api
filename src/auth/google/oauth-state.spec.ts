import { createHash } from 'node:crypto';
import {
  STATE_TTL_MS,
  buildFlowCookie,
  createState,
  generatePkce,
  parseFlowCookie,
  readCookie,
  verifyState,
} from './oauth-state.js';

const SECRET = 'a-test-secret-that-is-at-least-32-characters-long';

describe('OAuth state', () => {
  it('round-trips a valid state and keeps the nonce and retry flag', () => {
    const { token, nonce } = createState(SECRET, { retry: true });
    expect(verifyState(SECRET, token)).toMatchObject({ n: nonce, r: true });
  });

  it('expires after 10 minutes', () => {
    const now = 1_000_000;
    const { token } = createState(SECRET, { retry: false, now });
    expect(STATE_TTL_MS).toBe(10 * 60_000);
    expect(verifyState(SECRET, token, now + STATE_TTL_MS - 1)).not.toBeNull();
    expect(verifyState(SECRET, token, now + STATE_TTL_MS)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const { token } = createState(SECRET, { retry: false });
    const [body, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ n: 'x', exp: Date.now() + 60_000, r: false })).toString('base64url');
    expect(verifyState(SECRET, `${forged}.${signature}`)).toBeNull();
    expect(verifyState(SECRET, `${body}.${signature.slice(0, -2)}AA`)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const { token } = createState('another-secret-that-is-also-32-chars-long!!', { retry: false });
    expect(verifyState(SECRET, token)).toBeNull();
  });

  it.each(['', 'abc', 'a.b.c', '.', 'not-base64.!!!'])('rejects malformed input %j', (input) => {
    expect(verifyState(SECRET, input)).toBeNull();
  });

  it('generates a PKCE challenge that is the S256 hash of the verifier', () => {
    const { verifier, challenge } = generatePkce();
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });

  it('parses the flow cookie and rejects broken ones', () => {
    expect(parseFlowCookie(buildFlowCookie('nonce', 'verifier'))).toEqual({ nonce: 'nonce', verifier: 'verifier' });
    expect(parseFlowCookie(null)).toBeNull();
    expect(parseFlowCookie('onlyonepart')).toBeNull();
    expect(parseFlowCookie('a.b.c')).toBeNull();
    expect(parseFlowCookie('.b')).toBeNull();
  });

  it('reads a named cookie out of the Cookie header', () => {
    expect(readCookie('a=1; oauth_state=xyz; b=2', 'oauth_state')).toBe('xyz');
    expect(readCookie('a=1', 'oauth_state')).toBeNull();
    expect(readCookie(undefined, 'oauth_state')).toBeNull();
  });
});

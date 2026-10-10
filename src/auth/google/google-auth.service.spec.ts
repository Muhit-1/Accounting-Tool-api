import { createHash, randomBytes } from 'node:crypto';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../../encryption/encryption.service.js';
import { GoogleAuthService, DRIVE_FILE_SCOPE } from './google-auth.service.js';
import type { GoogleExchangeResult } from './google-oauth.client.js';
import { createState } from './oauth-state.js';

const JWT_SECRET = 'a-test-secret-that-is-at-least-32-characters-long';
const WEB = 'https://app.example.com';
const BASE_ENV: Record<string, string> = {
  JWT_SECRET,
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'super-secret-client-secret',
  GOOGLE_REDIRECT_URI: 'https://api.example.com/auth/google/callback',
  WEB_APP_URL: WEB,
};

interface UserRow {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  googleSub: string | null;
  googleRefreshTokenEnc: string | null;
}

// A just-enough in-memory stand-in for the three Prisma calls the service makes.
function createPrisma(rows: UserRow[] = []) {
  const users = [...rows];
  return {
    users,
    user: {
      findUnique: vi.fn(async ({ where }: { where: { googleSub?: string; email?: string } }) =>
        users.find((u) => (where.googleSub ? u.googleSub === where.googleSub : u.email === where.email)) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Partial<UserRow> }) => {
        const row = { id: `u${users.length + 1}`, passwordHash: null, googleSub: null, googleRefreshTokenEnc: null, ...data } as UserRow;
        users.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
        const row = users.find((u) => u.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
  };
}

function identity(overrides: Partial<GoogleExchangeResult> = {}): GoogleExchangeResult {
  return {
    sub: 'google-sub-1',
    email: 'Person@Example.com',
    emailVerified: true,
    name: 'Pat Person',
    scopes: ['openid', 'email', 'profile', DRIVE_FILE_SCOPE],
    refreshToken: 'refresh-token-plaintext',
    ...overrides,
  };
}

function setup(options: { users?: UserRow[]; env?: Record<string, string>; exchange?: ReturnType<typeof vi.fn> } = {}) {
  const env = options.env ?? BASE_ENV;
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  const prisma = createPrisma(options.users);
  const encryption = new EncryptionService({ get: () => randomBytes(32).toString('base64') } as unknown as ConfigService);
  encryption.onModuleInit();
  const auth = { issueAccessToken: vi.fn().mockReturnValue('signed.jwt.token') };
  const google = { exchangeCode: options.exchange ?? vi.fn().mockResolvedValue(identity()) };
  const service = new GoogleAuthService(config, prisma as never, encryption, auth as never, google as never);

  // Runs start() so state and cookie are real, then returns the callback inputs.
  function begin() {
    const started = service.start();
    const url = new URL(started.location);
    return {
      url,
      state: url.searchParams.get('state')!,
      cookieHeader: `${service.cookieName}=${started.cookie}`,
      cookieValue: started.cookie!,
    };
  }
  return { service, prisma, encryption, auth, google, begin };
}

function existingUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u-existing',
    email: 'person@example.com',
    name: 'Old Name',
    passwordHash: 'bcrypt-hash',
    googleSub: null,
    googleRefreshTokenEnc: null,
    ...overrides,
  };
}

describe('GoogleAuthService', () => {
  describe('start', () => {
    it('builds the Google authorization URL with every required parameter', () => {
      const { begin, service } = setup();
      const { url, state, cookieValue } = begin();

      expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      const p = url.searchParams;
      expect(p.get('client_id')).toBe('client-id');
      expect(p.get('redirect_uri')).toBe(BASE_ENV.GOOGLE_REDIRECT_URI);
      expect(p.get('response_type')).toBe('code');
      expect(p.get('scope')).toBe(`openid email profile ${DRIVE_FILE_SCOPE}`);
      expect(p.get('access_type')).toBe('offline');
      expect(p.get('include_granted_scopes')).toBe('true');
      expect(p.get('prompt')).toBe('select_account');
      expect(p.get('code_challenge_method')).toBe('S256');
      expect(p.get('state')).toBe(state);

      // PKCE: the challenge Google holds is the hash of the verifier in our cookie.
      const [nonce, verifier] = cookieValue.split('.');
      expect(p.get('code_challenge')).toBe(createHash('sha256').update(verifier).digest('base64url'));
      expect(p.get('nonce')).toBe(nonce);
      expect(service.cookieName).toBe('oauth_state');
    });

    it('uses the __Host- cookie name and Secure in production', () => {
      const { service } = setup({ env: { ...BASE_ENV, NODE_ENV: 'production' } });
      expect(service.cookieName).toBe('__Host-oauth_state');
      expect(service.cookieOptions).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
    });
  });

  describe('state and cookie checks', () => {
    it('accepts a valid state with its cookie', async () => {
      const { service, begin } = setup();
      const { state, cookieHeader } = begin();
      const result = await service.handleCallback({ state, code: 'abc' }, cookieHeader);
      expect(result.location).toContain('/auth/callback#token=');
    });

    it('rejects a missing cookie', async () => {
      const { service, begin, google } = setup();
      const { state } = begin();
      const result = await service.handleCallback({ state, code: 'abc' }, undefined);
      expect(result.location).toBe(`${WEB}/login?error=invalid_state`);
      expect(google.exchangeCode).not.toHaveBeenCalled();
    });

    it('rejects a cookie that belongs to a different login attempt', async () => {
      const { service, begin, google } = setup();
      const first = begin();
      const second = begin();
      const result = await service.handleCallback({ state: first.state, code: 'abc' }, second.cookieHeader);
      expect(result.location).toBe(`${WEB}/login?error=invalid_state`);
      expect(google.exchangeCode).not.toHaveBeenCalled();
    });

    it('rejects an expired state', async () => {
      const { service, begin } = setup();
      const { cookieHeader, cookieValue } = begin();
      const expired = createState(JWT_SECRET, { retry: false, now: Date.now() - 11 * 60_000, nonce: cookieValue.split('.')[0] });
      const result = await service.handleCallback({ state: expired.token, code: 'abc' }, cookieHeader);
      expect(result.location).toBe(`${WEB}/login?error=invalid_state`);
    });

    it('rejects a tampered or missing state', async () => {
      const { service, begin } = setup();
      const { state, cookieHeader } = begin();
      const tampered = `${state.slice(0, -3)}AAA`;
      expect((await service.handleCallback({ state: tampered, code: 'abc' }, cookieHeader)).location).toBe(
        `${WEB}/login?error=invalid_state`,
      );
      expect((await service.handleCallback({ code: 'abc' }, cookieHeader)).location).toBe(
        `${WEB}/login?error=invalid_state`,
      );
    });

    it('clears the flow cookie on every callback outcome', async () => {
      const { service, begin } = setup();
      const { state, cookieHeader } = begin();
      expect((await service.handleCallback({ state, code: 'abc' }, cookieHeader)).cookie).toBeNull();
      expect((await service.handleCallback({}, undefined)).cookie).toBeNull();
    });
  });

  describe('failure redirects', () => {
    it('redirects to the login page with access_denied when the user declined consent', async () => {
      const { service, begin, google } = setup();
      const { state, cookieHeader } = begin();
      const result = await service.handleCallback({ state, error: 'access_denied' }, cookieHeader);
      expect(result.location).toBe(`${WEB}/login?error=access_denied`);
      expect(google.exchangeCode).not.toHaveBeenCalled();
    });

    it('reports any other Google error as google_failed without echoing it', async () => {
      const { service, begin } = setup();
      const { state, cookieHeader } = begin();
      const result = await service.handleCallback({ state, error: 'server_error<script>' }, cookieHeader);
      expect(result.location).toBe(`${WEB}/login?error=google_failed`);
    });

    it('reports a missing or oversized code as google_failed', async () => {
      const { service, begin } = setup();
      const a = begin();
      expect((await service.handleCallback({ state: a.state }, a.cookieHeader)).location).toBe(
        `${WEB}/login?error=google_failed`,
      );
      const b = begin();
      expect((await service.handleCallback({ state: b.state, code: 'x'.repeat(5000) }, b.cookieHeader)).location).toBe(
        `${WEB}/login?error=google_failed`,
      );
    });

    it('reports a failed exchange or ID token check as google_failed and creates nothing', async () => {
      const exchange = vi.fn().mockRejectedValue(new Error('invalid_grant: secret details'));
      const { service, begin, prisma } = setup({ exchange });
      const { state, cookieHeader } = begin();
      const result = await service.handleCallback({ state, code: 'abc' }, cookieHeader);
      expect(result.location).toBe(`${WEB}/login?error=google_failed`);
      expect(prisma.users).toHaveLength(0);
    });

    it('refuses to log in without the drive.file scope', async () => {
      const exchange = vi.fn().mockResolvedValue(identity({ scopes: ['openid', 'email', 'profile'] }));
      const { service, begin, prisma, auth } = setup({ exchange });
      const { state, cookieHeader } = begin();
      const result = await service.handleCallback({ state, code: 'abc' }, cookieHeader);
      expect(result.location).toBe(`${WEB}/login?error=drive_permission_required`);
      expect(prisma.users).toHaveLength(0);
      expect(auth.issueAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('account resolution', () => {
    it('creates a new user on first login and redirects with the JWT in the URL fragment', async () => {
      const { service, begin, prisma, auth } = setup();
      const { state, cookieHeader } = begin();
      const result = await service.handleCallback({ state, code: 'abc' }, cookieHeader);

      expect(prisma.users).toHaveLength(1);
      expect(prisma.users[0]).toMatchObject({
        email: 'person@example.com',
        name: 'Pat Person',
        googleSub: 'google-sub-1',
        passwordHash: null,
      });
      expect(auth.issueAccessToken).toHaveBeenCalledWith(prisma.users[0]);
      expect(result.location).toBe(`${WEB}/auth/callback#token=signed.jwt.token`);
      expect(new URL(result.location).search).toBe('');
    });

    it('falls back to the email local part when Google gives no name', async () => {
      const exchange = vi.fn().mockResolvedValue(identity({ name: null }));
      const { service, begin, prisma } = setup({ exchange });
      const { state, cookieHeader } = begin();
      await service.handleCallback({ state, code: 'abc' }, cookieHeader);
      expect(prisma.users[0].name).toBe('person');
    });

    it('signs in an existing user by googleSub, even if their Google email changed', async () => {
      const user = existingUser({ googleSub: 'google-sub-1', email: 'old@example.com', googleRefreshTokenEnc: 'stored' });
      const { service, begin, prisma, auth } = setup({
        users: [user],
        exchange: vi.fn().mockResolvedValue(identity({ refreshToken: null })),
      });
      const { state, cookieHeader } = begin();
      const result = await service.handleCallback({ state, code: 'abc' }, cookieHeader);

      expect(prisma.users).toHaveLength(1);
      expect(auth.issueAccessToken).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-existing' }));
      expect(result.location).toContain('#token=signed.jwt.token');
    });

    it('links to an existing account by email when Google says the email is verified', async () => {
      const user = existingUser();
      const { service, begin, prisma } = setup({ users: [user] });
      const { state, cookieHeader } = begin();
      const result = await service.handleCallback({ state, code: 'abc' }, cookieHeader);

      expect(prisma.users).toHaveLength(1);
      expect(user.googleSub).toBe('google-sub-1');
      // Everything else on the account is untouched.
      expect(user.passwordHash).toBe('bcrypt-hash');
      expect(user.name).toBe('Old Name');
      expect(result.location).toContain('#token=');
    });

    it('does NOT link by email when email_verified is false', async () => {
      const user = existingUser();
      const exchange = vi.fn().mockResolvedValue(identity({ emailVerified: false }));
      const { service, begin, prisma, auth } = setup({ users: [user], exchange });
      const { state, cookieHeader } = begin();
      const result = await service.handleCallback({ state, code: 'abc' }, cookieHeader);

      expect(result.location).toBe(`${WEB}/login?error=google_failed`);
      expect(user.googleSub).toBeNull();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(auth.issueAccessToken).not.toHaveBeenCalled();
    });

    it('still creates a new user whose email is unverified when no account has that email', async () => {
      const exchange = vi.fn().mockResolvedValue(identity({ emailVerified: false }));
      const { service, begin, prisma } = setup({ exchange });
      const { state, cookieHeader } = begin();
      await service.handleCallback({ state, code: 'abc' }, cookieHeader);
      expect(prisma.users).toHaveLength(1);
    });

    it('does not take over an account already linked to a different Google account', async () => {
      const user = existingUser({ googleSub: 'someone-else', googleRefreshTokenEnc: 'stored' });
      const { service, begin, auth } = setup({ users: [user] });
      const { state, cookieHeader } = begin();
      const result = await service.handleCallback({ state, code: 'abc' }, cookieHeader);
      expect(result.location).toBe(`${WEB}/login?error=google_failed`);
      expect(user.googleSub).toBe('someone-else');
      expect(auth.issueAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('refresh token', () => {
    it('stores the refresh token encrypted, never as plaintext', async () => {
      const { service, begin, prisma, encryption } = setup();
      const { state, cookieHeader } = begin();
      await service.handleCallback({ state, code: 'abc' }, cookieHeader);

      const stored = prisma.users[0].googleRefreshTokenEnc!;
      expect(stored).not.toContain('refresh-token-plaintext');
      expect(stored.split('.')).toHaveLength(3);
      expect(encryption.decrypt(stored)).toBe('refresh-token-plaintext');
    });

    it('does not overwrite a stored refresh token when Google returns none', async () => {
      const user = existingUser({ googleSub: 'google-sub-1', googleRefreshTokenEnc: 'previously-encrypted' });
      const { service, begin, prisma } = setup({
        users: [user],
        exchange: vi.fn().mockResolvedValue(identity({ refreshToken: null })),
      });
      const { state, cookieHeader } = begin();
      await service.handleCallback({ state, code: 'abc' }, cookieHeader);
      expect(user.googleRefreshTokenEnc).toBe('previously-encrypted');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('replaces the stored token when Google returns a new one', async () => {
      const user = existingUser({ googleSub: 'google-sub-1', googleRefreshTokenEnc: 'previously-encrypted' });
      const { service, begin, encryption } = setup({ users: [user] });
      const { state, cookieHeader } = begin();
      await service.handleCallback({ state, code: 'abc' }, cookieHeader);
      expect(user.googleRefreshTokenEnc).not.toBe('previously-encrypted');
      expect(encryption.decrypt(user.googleRefreshTokenEnc)).toBe('refresh-token-plaintext');
    });

    it('restarts once with prompt=consent when there is no refresh token and none stored', async () => {
      const exchange = vi.fn().mockResolvedValueOnce(identity({ refreshToken: null }));
      const { service, begin, prisma, auth } = setup({ exchange });
      const { state, cookieHeader } = begin();
      const restart = await service.handleCallback({ state, code: 'abc' }, cookieHeader);

      const url = new URL(restart.location);
      expect(url.origin).toBe('https://accounts.google.com');
      expect(url.searchParams.get('prompt')).toBe('consent');
      expect(restart.cookie).toBeTruthy();
      expect(prisma.users).toHaveLength(0);
      expect(auth.issueAccessToken).not.toHaveBeenCalled();

      // The restarted flow now gets a token and completes.
      exchange.mockResolvedValueOnce(identity());
      const done = await service.handleCallback(
        { state: url.searchParams.get('state')!, code: 'def' },
        `${service.cookieName}=${restart.cookie}`,
      );
      expect(done.location).toContain('#token=');
      expect(prisma.users[0].googleRefreshTokenEnc).toBeTruthy();
    });

    it('does not restart a second time if the restarted flow still returns no refresh token', async () => {
      const exchange = vi.fn().mockResolvedValue(identity({ refreshToken: null }));
      const { service, begin, prisma } = setup({ exchange });
      const first = begin();
      const restart = await service.handleCallback({ state: first.state, code: 'abc' }, first.cookieHeader);
      const url = new URL(restart.location);
      const second = await service.handleCallback(
        { state: url.searchParams.get('state')!, code: 'def' },
        `${service.cookieName}=${restart.cookie}`,
      );
      expect(second.location).toBe(`${WEB}/login?error=google_failed`);
      expect(prisma.users).toHaveLength(0);
    });
  });

  describe('configuration', () => {
    it('answers 503 for start and callback when Google is not configured', async () => {
      const { service } = setup({ env: { JWT_SECRET } });
      expect(() => service.start()).toThrow(ServiceUnavailableException);
      await expect(service.handleCallback({}, undefined)).rejects.toThrow(ServiceUnavailableException);
    });

    it('answers 503 when only some of the variables are set', () => {
      const { GOOGLE_CLIENT_SECRET: _omitted, ...partial } = BASE_ENV;
      const { service } = setup({ env: partial });
      expect(() => service.start()).toThrow(ServiceUnavailableException);
    });
  });

  describe('logging', () => {
    it('never logs the code, state, tokens or client secret', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const exchange = vi.fn().mockRejectedValue(
        Object.assign(new Error('boom authorization-code-123 super-secret-client-secret'), {
          response: { data: { error: 'invalid_grant' } },
        }),
      );
      const { service, begin } = setup({ exchange });
      const { state, cookieHeader } = begin();
      await service.handleCallback({ state, code: 'authorization-code-123' }, cookieHeader);

      const logged = warn.mock.calls.map((call) => String(call[0])).join('\n');
      expect(logged).toContain('invalid_grant');
      for (const secret of ['authorization-code-123', 'super-secret-client-secret', state]) {
        expect(logged).not.toContain(secret);
      }
      warn.mockRestore();
    });
  });
});

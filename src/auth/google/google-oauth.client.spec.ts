import { GoogleOAuthClient } from './google-oauth.client.js';

// google-auth-library is mocked: no network, no real Google credentials.
const getToken = vi.fn();
const verifyIdToken = vi.fn();
vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(function () {
    return { getToken, verifyIdToken };
  }),
}));

const config = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://api.example.com/auth/google/callback',
  webAppUrl: 'https://app.example.com',
};
const params = { code: 'code', codeVerifier: 'verifier', nonce: 'nonce-1' };

function payload(overrides: Record<string, unknown> = {}) {
  return {
    sub: 'sub-1',
    email: 'a@example.com',
    email_verified: true,
    name: 'A',
    nonce: 'nonce-1',
    ...overrides,
  };
}

function mockGoogle(tokens: Record<string, unknown>, idPayload: Record<string, unknown> | null) {
  getToken.mockResolvedValue({ tokens });
  verifyIdToken.mockResolvedValue({ getPayload: () => idPayload });
}

describe('GoogleOAuthClient', () => {
  const client = new GoogleOAuthClient();
  beforeEach(() => vi.clearAllMocks());

  it('exchanges the code with the PKCE verifier and verifies the ID token against our client ID', async () => {
    mockGoogle(
      { id_token: 'idt', scope: 'openid email profile https://www.googleapis.com/auth/drive.file', refresh_token: 'rt' },
      payload(),
    );

    const result = await client.exchangeCode(config, params);

    expect(getToken).toHaveBeenCalledWith({ code: 'code', codeVerifier: 'verifier' });
    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'idt', audience: 'client-id' });
    expect(result).toEqual({
      sub: 'sub-1',
      email: 'a@example.com',
      emailVerified: true,
      name: 'A',
      scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.file'],
      refreshToken: 'rt',
    });
  });

  it('treats a missing email_verified claim as unverified and a missing refresh token as null', async () => {
    mockGoogle({ id_token: 'idt', scope: 'openid' }, payload({ email_verified: undefined }));
    const result = await client.exchangeCode(config, params);
    expect(result.emailVerified).toBe(false);
    expect(result.refreshToken).toBeNull();
  });

  it.each([
    ['no ID token', {}, payload()],
    ['no subject', { id_token: 'idt' }, payload({ sub: undefined })],
    ['no email', { id_token: 'idt' }, payload({ email: undefined })],
    ['a blank email', { id_token: 'idt' }, payload({ email: '  ' })],
    ['a different nonce', { id_token: 'idt' }, payload({ nonce: 'someone-elses' })],
    ['no nonce', { id_token: 'idt' }, payload({ nonce: undefined })],
    ['no payload', { id_token: 'idt' }, null],
  ])('rejects %s', async (_label, tokens, idPayload) => {
    mockGoogle(tokens, idPayload);
    await expect(client.exchangeCode(config, params)).rejects.toThrow();
  });

  it('propagates a failed ID token verification (wrong audience, bad signature)', async () => {
    getToken.mockResolvedValue({ tokens: { id_token: 'idt' } });
    verifyIdToken.mockRejectedValue(new Error('Wrong recipient'));
    await expect(client.exchangeCode(config, params)).rejects.toThrow('Wrong recipient');
  });
});

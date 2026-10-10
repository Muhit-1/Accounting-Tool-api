import { readGoogleConfig } from './google-config.js';

const VALID = {
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_REDIRECT_URI: 'https://api.example.com/auth/google/callback',
  WEB_APP_URL: 'https://app.example.com',
};

describe('readGoogleConfig', () => {
  it('is enabled when all four variables are set', () => {
    expect(readGoogleConfig(VALID)).toEqual({
      enabled: true,
      config: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: VALID.GOOGLE_REDIRECT_URI,
        webAppUrl: VALID.WEB_APP_URL,
      },
    });
  });

  it('does not throw, and lists what is missing, when nothing or only some is set', () => {
    expect(readGoogleConfig({})).toMatchObject({ enabled: false, configured: [] });
    const partial = readGoogleConfig({ ...VALID, GOOGLE_CLIENT_SECRET: '   ' });
    expect(partial).toMatchObject({ enabled: false, missing: ['GOOGLE_CLIENT_SECRET'] });
  });

  it.each([
    ['a trailing slash', 'https://app.example.com/'],
    ['a path', 'https://app.example.com/app'],
    ['no scheme', 'app.example.com'],
    ['a non-http scheme', 'ftp://app.example.com'],
  ])('rejects a WEB_APP_URL with %s', (_label, value) => {
    expect(() => readGoogleConfig({ ...VALID, WEB_APP_URL: value })).toThrow(/WEB_APP_URL/);
  });

  it('rejects a redirect URI that is not the callback route', () => {
    expect(() => readGoogleConfig({ ...VALID, GOOGLE_REDIRECT_URI: 'https://api.example.com/auth/callback' })).toThrow(
      /GOOGLE_REDIRECT_URI/,
    );
    expect(() => readGoogleConfig({ ...VALID, GOOGLE_REDIRECT_URI: 'not a url' })).toThrow(/GOOGLE_REDIRECT_URI/);
  });

  it('requires https in production but allows http locally', () => {
    const local = { ...VALID, WEB_APP_URL: 'http://localhost:5173', GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback' };
    expect(readGoogleConfig(local).enabled).toBe(true);
    expect(() => readGoogleConfig({ ...local, NODE_ENV: 'production' })).toThrow(/https/);
  });
});

import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthController } from '../auth.controller.js';
import { AuthService } from '../auth.service.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { RateLimitGuard } from '../../common/rate-limit.guard.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EncryptionService } from '../../encryption/encryption.service.js';
import { GoogleAuthController } from './google-auth.controller.js';
import { GoogleAuthService } from './google-auth.service.js';
import { GoogleOAuthClient } from './google-oauth.client.js';

const GOOGLE_ENV = {
  JWT_SECRET: 'a-test-secret-that-is-at-least-32-characters-long',
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_REDIRECT_URI: 'https://api.example.com/auth/google/callback',
  WEB_APP_URL: 'https://app.example.com',
};

async function createApp(env: Record<string, string>) {
  const authService = {
    register: vi.fn().mockResolvedValue({ accessToken: 't', user: {} }),
    login: vi.fn().mockResolvedValue({ accessToken: 't', user: {} }),
    getProfile: vi.fn(),
    issueAccessToken: vi.fn().mockReturnValue('signed.jwt.token'),
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [AuthController, GoogleAuthController],
    providers: [
      GoogleAuthService,
      { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
      { provide: AuthService, useValue: authService },
      { provide: PrismaService, useValue: {} },
      { provide: EncryptionService, useValue: {} },
      { provide: GoogleOAuthClient, useValue: { exchangeCode: vi.fn() } },
      // Registered as AppModule does, to prove the per-route limits apply.
      { provide: APP_GUARD, useClass: RateLimitGuard },
    ],
  })
    // JwtAuthGuard (on /auth/me) is irrelevant here and needs Passport wired up.
    .overrideGuard(JwtAuthGuard)
    .useValue({ canActivate: () => true })
    .compile();
  const app: INestApplication = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return { app, authService };
}

describe('Google auth routes', () => {
  let app: INestApplication;
  afterEach(async () => {
    await app?.close();
  });

  describe('when configured', () => {
    beforeEach(async () => {
      ({ app } = await createApp(GOOGLE_ENV));
    });

    it('GET /auth/google redirects to Google and sets the httpOnly flow cookie', async () => {
      const res = await request(app.getHttpServer()).get('/auth/google').expect(302);

      expect(res.headers.location).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
      expect(res.headers['cache-control']).toBe('no-store');
      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toMatch(/^oauth_state=/);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      expect(cookie).not.toContain('Secure'); // not production
    });

    it('GET /auth/google/callback with access_denied redirects to the login page and clears the cookie', async () => {
      const server = app.getHttpServer();
      const start = await request(server).get('/auth/google').expect(302);
      const state = new URL(start.headers.location).searchParams.get('state')!;
      const cookie = String(start.headers['set-cookie']).split(';')[0];

      const res = await request(server)
        .get('/auth/google/callback')
        .query({ error: 'access_denied', state })
        .set('Cookie', cookie)
        .expect(302);

      expect(res.headers.location).toBe('https://app.example.com/login?error=access_denied');
      expect(String(res.headers['set-cookie'])).toMatch(/oauth_state=;/);
    });

    it('accepts the extra query parameters Google adds to the callback', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/google/callback')
        .query({ code: 'x', state: 'bad', scope: 'a b', authuser: '0', prompt: 'consent', iss: 'https://accounts.google.com' })
        .expect(302);
      expect(res.headers.location).toBe('https://app.example.com/login?error=invalid_state');
    });

    it('rate limits both routes', async () => {
      const server = app.getHttpServer();
      for (let i = 0; i < 10; i += 1) await request(server).get('/auth/google').expect(302);
      await request(server).get('/auth/google').expect(429);
      for (let i = 0; i < 10; i += 1) await request(server).get('/auth/google/callback').expect(302);
      await request(server).get('/auth/google/callback').expect(429);
    });
  });

  it('uses a Secure __Host- cookie in production', async () => {
    ({ app } = await createApp({ ...GOOGLE_ENV, NODE_ENV: 'production' }));
    const res = await request(app.getHttpServer()).get('/auth/google').expect(302);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/^__Host-oauth_state=/);
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).not.toContain('Domain');
  });

  it('returns 503 with a clear message from both routes when Google is not configured', async () => {
    ({ app } = await createApp({ JWT_SECRET: GOOGLE_ENV.JWT_SECRET }));
    for (const path of ['/auth/google', '/auth/google/callback']) {
      const res = await request(app.getHttpServer()).get(path).expect(503);
      expect(res.body.message).toBe('Google sign-in is not configured on this server');
    }
  });

  describe('email/password endpoints', () => {
    const credentials = { email: 'a@b.com', password: 'password123' };
    const registration = { ...credentials, name: 'A' };

    it.each([
      ['unset', {}],
      ['"false"', { AUTH_PASSWORD_ENABLED: 'false' }],
      ['"TRUE" (not exactly "true")', { AUTH_PASSWORD_ENABLED: 'TRUE' }],
      ['"1"', { AUTH_PASSWORD_ENABLED: '1' }],
    ])('return 404 when AUTH_PASSWORD_ENABLED is %s', async (_label, extra) => {
      let authService;
      ({ app, authService } = await createApp({ ...GOOGLE_ENV, ...extra }));
      await request(app.getHttpServer()).post('/auth/login').send(credentials).expect(404);
      await request(app.getHttpServer()).post('/auth/register').send(registration).expect(404);
      expect(authService.login).not.toHaveBeenCalled();
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('work again when AUTH_PASSWORD_ENABLED=true', async () => {
      let authService;
      ({ app, authService } = await createApp({ ...GOOGLE_ENV, AUTH_PASSWORD_ENABLED: 'true' }));
      await request(app.getHttpServer()).post('/auth/login').send(credentials).expect(201);
      await request(app.getHttpServer()).post('/auth/register').send(registration).expect(201);
      expect(authService.login).toHaveBeenCalled();
      expect(authService.register).toHaveBeenCalled();
    });
  });
});

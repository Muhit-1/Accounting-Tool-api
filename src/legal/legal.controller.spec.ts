import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { LegalModule } from './legal.module.js';
import { RateLimitGuard } from '../common/rate-limit.guard.js';

describe('Legal endpoints (public)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    // The rate limiter is registered exactly as AppModule does it, to prove
    // these public routes are still covered by the global limit. No JWT
    // strategy is wired up, so a 200 also shows that no auth is required.
    const moduleRef = await Test.createTestingModule({
      imports: [LegalModule],
      providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([
    ['privacy', 'Privacy Policy'],
    ['terms', 'Terms of Service'],
  ])('GET /legal/%s returns the structured document without auth', async (slug, title) => {
    const res = await request(app.getHttpServer()).get(`/legal/${slug}`).expect(200);

    expect(res.body).toMatchObject({
      slug,
      title,
      version: '1.1',
      effectiveDate: '2026-10-10',
      language: 'en',
    });
    expect(Array.isArray(res.body.sections)).toBe(true);
    expect(res.body.sections.length).toBeGreaterThan(0);
    for (const section of res.body.sections) {
      expect(typeof section.heading).toBe('string');
      expect(section.paragraphs === undefined || Array.isArray(section.paragraphs)).toBe(true);
      expect(section.bullets === undefined || Array.isArray(section.bullets)).toBe(true);
      expect(section.paragraphs || section.bullets).toBeDefined();
    }
  });

  it('allows shared caching for five minutes', async () => {
    const res = await request(app.getHttpServer()).get('/legal/privacy').expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
  });

  it.each(['imprint', 'constructor', '__proto__'])('returns 404 for the unknown slug %s, uncached', async (slug) => {
    const res = await request(app.getHttpServer()).get(`/legal/${slug}`).expect(404);
    expect(res.headers['cache-control']).toBeUndefined();
  });

  it('stays under the global rate limiter', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 100; i += 1) {
      await request(server).get('/legal/terms').expect(200);
    }
    await request(server).get('/legal/terms').expect(429);
  });

  it('contains the Google Limited Use statement and the operator details', async () => {
    const privacy = (await request(app.getHttpServer()).get('/legal/privacy')).body;
    const text = JSON.stringify(privacy);
    expect(text).toContain(
      "Exin Finance's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.",
    );
    expect(text).toContain('https://www.googleapis.com/auth/drive.file');
    expect(text).toContain('HRB 309076');
  });

  it('describes Google sign-in, the required drive.file scope and the encrypted refresh token', async () => {
    const privacy = (await request(app.getHttpServer()).get('/legal/privacy')).body;
    const text = JSON.stringify(privacy);
    expect(text).toContain('only way to sign in');
    expect(text).toContain('This permission is required');
    expect(text).toContain('keeps your invoice PDFs and receipts only there');
    expect(text).toContain('refresh token');
    expect(text).toContain('AES-256-GCM');
    // No claim that survived from the pre-Google text.
    expect(text).not.toContain('does not set cookies');
    expect(text).not.toContain('bcrypt hashes');
  });
});

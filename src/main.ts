import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

const MIN_SECRET_LENGTH = 32;

// Fail fast and loudly on a missing/weak secret rather than either crashing
// confusingly later (JWT_SECRET) or silently running with a guessable key
// (ENCRYPTION_KEY, which protects bank details at rest).
function assertSecretsConfigured() {
  const problems: string[] = [];
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < MIN_SECRET_LENGTH) {
    problems.push(`JWT_SECRET must be set and at least ${MIN_SECRET_LENGTH} characters`);
  }
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey || Buffer.from(encryptionKey, 'base64').length !== 32) {
    problems.push('ENCRYPTION_KEY must be set to a base64-encoded 32-byte key (see .env.example)');
  }
  if (problems.length > 0) {
    throw new Error(`Refusing to start with insecure configuration:\n- ${problems.join('\n- ')}`);
  }
}

async function bootstrap() {
  assertSecretsConfigured();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Cap JSON bodies: 1mb covers the largest legitimate payload (a logo up
    // to 500KB, base64-encoded) without letting anyone post huge documents.
    bodyParser: true,
  });
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '100kb', extended: false });
  app.disable('x-powered-by');
  // Behind a reverse proxy/load balancer, set TRUST_PROXY (e.g. "1") so
  // req.ip — which the rate limiter keys on — is the real client, not the
  // proxy. Left off by default: trusting X-Forwarded-For with no proxy in
  // front lets any client spoof its IP and dodge rate limits.
  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);
  }
  app.enableShutdownHooks();

  app.use(
    helmet({
      // This API is deliberately cross-origin from the frontend dev server
      // (CORS below already restricts which origins may call it) — Helmet's
      // default same-origin Cross-Origin-Resource-Policy would otherwise
      // silently break the frontend's fetch() calls for invoice PDFs and
      // uploaded receipts.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (allowedOrigins.includes('*')) {
    throw new Error('Refusing to start: CORS_ORIGIN must list explicit origins, not "*"');
  }
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
    // Auth is a bearer token in the Authorization header, not a cookie.
    credentials: false,
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

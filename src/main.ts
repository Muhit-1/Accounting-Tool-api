import { NestFactory } from '@nestjs/core';
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

  const app = await NestFactory.create(AppModule);

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

  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),
    credentials: true,
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

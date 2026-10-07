import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { RateLimit } from './common/rate-limit.guard.js';

// Liveness probes (Coolify/Docker health check, uptime monitors) poll every
// few seconds; the default 100/min would be fine for one prober but this
// leaves room for several without ever turning a healthy app "unhealthy".
const HEALTH_RATE_LIMIT = { limit: 600, windowMs: 60_000 };

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // Deliberately does not touch the database: it answers "is the process up",
  // so a DB outage doesn't make the orchestrator restart a healthy API.
  @Get('health')
  @RateLimit(HEALTH_RATE_LIMIT)
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }
}

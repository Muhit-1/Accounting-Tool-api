import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export const RATE_LIMIT_KEY = 'rateLimit';

// Per-route override, e.g. @RateLimit({ limit: 5, windowMs: 60_000 }) on
// login/register to blunt brute-force/credential-stuffing specifically.
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

const DEFAULT_OPTIONS: RateLimitOptions = { limit: 100, windowMs: 60_000 };

// A small self-contained fixed-window limiter (no @nestjs/throttler — its
// latest release doesn't yet declare peer support for the NestJS 12 this
// project is on). In-memory only: fine for this app's single-process,
// local-first deployment; wouldn't survive multiple instances behind a
// load balancer without moving the counters to a shared store.
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options =
      this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]) ??
      DEFAULT_OPTIONS;

    const request = context.switchToHttp().getRequest();
    const key = `${request.ip}:${context.getClass().name}.${context.getHandler().name}`;
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      this.sweepOccasionally(now);
      return true;
    }

    if (bucket.count >= options.limit) {
      throw new HttpException('Too many requests — please try again later', HttpStatus.TOO_MANY_REQUESTS);
    }
    bucket.count += 1;
    return true;
  }

  // Cheap, unbounded-growth guard: every so often, drop expired entries
  // instead of letting the map grow forever as new IPs/routes show up.
  private sweepOccasionally(now: number) {
    if (Math.random() > 0.01) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

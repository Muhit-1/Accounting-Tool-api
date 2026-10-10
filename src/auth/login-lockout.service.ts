import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const MAX_FAILED_ATTEMPTS = 5;
// Failures only count while they are this recent; an account is then locked for
// the same span. Long enough to make guessing pointless, short enough that a
// forgotten password costs minutes, not a support ticket.
const WINDOW_MS = 15 * 60_000;
// Bounds memory: anyone can submit endless made-up emails.
const MAX_TRACKED_EMAILS = 10_000;

interface Entry {
  failures: number;
  windowStart: number;
  lockedUntil: number;
}

// Per-ACCOUNT brake on password guessing, on top of the per-IP rate limit (5
// requests/min) which a botnet or a rotating proxy sidesteps. Tracks the email
// string whether or not it is registered, so a lock (or the lack of one) never
// reveals which emails have accounts. In memory only: resets on restart and is
// not shared between instances, like the rate limiter. The trade-off is that
// someone can lock a known email out for 15 minutes by failing on purpose; the
// per-IP limit keeps that to about one account per minute per attacker.
@Injectable()
export class LoginLockoutService {
  private readonly entries = new Map<string, Entry>();

  assertNotLocked(email: string, now = Date.now()): void {
    const entry = this.entries.get(email);
    if (entry && entry.lockedUntil > now) {
      throw new HttpException(
        'Too many failed sign-in attempts for this account — please try again in a few minutes',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(email: string, now = Date.now()): void {
    let entry = this.entries.get(email);
    if (!entry || now - entry.windowStart > WINDOW_MS) {
      entry = { failures: 0, windowStart: now, lockedUntil: 0 };
    }
    entry.failures += 1;
    if (entry.failures >= MAX_FAILED_ATTEMPTS) {
      entry.lockedUntil = now + WINDOW_MS;
      // Start counting afresh once the lock ends.
      entry.failures = 0;
      entry.windowStart = entry.lockedUntil;
    }
    // Re-insert so the Map's order stays "least recently touched first".
    this.entries.delete(email);
    this.entries.set(email, entry);
    this.prune(now);
  }

  recordSuccess(email: string): void {
    this.entries.delete(email);
  }

  private prune(now: number): void {
    if (this.entries.size <= MAX_TRACKED_EMAILS) return;
    for (const [key, entry] of this.entries) {
      if (entry.lockedUntil <= now && now - entry.windowStart > WINDOW_MS) this.entries.delete(key);
    }
    // Still full of live entries: drop the least recently touched ones.
    for (const key of this.entries.keys()) {
      if (this.entries.size <= MAX_TRACKED_EMAILS) break;
      this.entries.delete(key);
    }
  }
}

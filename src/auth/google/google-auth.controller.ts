import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RateLimit } from '../../common/rate-limit.guard.js';
import { GoogleAuthService, type GoogleRedirect } from './google-auth.service.js';

// Costly enough (a Google round trip each) to deserve its own, tighter limit
// than the app-wide default, but loose enough that a person retrying a failed
// login is not locked out.
const GOOGLE_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

// Public on purpose (no JwtAuthGuard): these routes are how a user gets a token.
@Controller('auth/google')
export class GoogleAuthController {
  constructor(private readonly googleAuth: GoogleAuthService) {}

  @RateLimit(GOOGLE_RATE_LIMIT)
  @Get()
  start(@Res() res: Response) {
    this.respond(res, this.googleAuth.start());
  }

  // @Query() is left untyped on purpose: Google appends parameters of its own
  // (scope, authuser, prompt, iss, ...) and the global whitelist validation
  // would reject any a DTO did not list.
  @RateLimit(GOOGLE_RATE_LIMIT)
  @Get('callback')
  async callback(@Query() query: Record<string, unknown>, @Req() req: Request, @Res() res: Response) {
    this.respond(res, await this.googleAuth.handleCallback(query, req.headers.cookie));
  }

  private respond(res: Response, redirect: GoogleRedirect) {
    const { cookieName, cookieOptions, cookieMaxAgeMs } = this.googleAuth;
    if (redirect.cookie) {
      res.cookie(cookieName, redirect.cookie, { ...cookieOptions, maxAge: cookieMaxAgeMs });
    } else {
      res.clearCookie(cookieName, cookieOptions);
    }
    // The redirect target can carry a login token; never let anything cache it.
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, redirect.location);
  }
}

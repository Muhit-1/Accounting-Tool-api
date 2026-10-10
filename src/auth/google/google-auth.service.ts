import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EncryptionService } from '../../encryption/encryption.service.js';
import { AuthService } from '../auth.service.js';
import { readGoogleConfig, type GoogleConfig } from './google-config.js';
import { GoogleOAuthClient } from './google-oauth.client.js';
import {
  STATE_TTL_MS,
  buildFlowCookie,
  createState,
  generatePkce,
  parseFlowCookie,
  readCookie,
  safeEqual,
  verifyState,
} from './oauth-state.js';

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SCOPES = ['openid', 'email', 'profile', DRIVE_FILE_SCOPE];

// Short, fixed codes: the web app maps them to messages, and nothing about
// what went wrong inside is revealed to the browser.
export type GoogleLoginError = 'access_denied' | 'drive_permission_required' | 'invalid_state' | 'google_failed';

const MAX_NAME_LENGTH = 120;
const MAX_PARAM_LENGTH = 2048;

export interface GoogleRedirect {
  location: string;
  // New value for the flow cookie, or null to clear it.
  cookie: string | null;
}

@Injectable()
export class GoogleAuthService implements OnModuleInit {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly auth: AuthService,
    private readonly google: GoogleOAuthClient,
  ) {}

  onModuleInit() {
    const result = this.readConfig();
    if (!result.enabled) {
      this.logger.warn(
        `Google sign-in is disabled; /auth/google answers 503. Missing: ${result.missing.join(', ')}`,
      );
    }
  }

  // __Host- makes the browser refuse the cookie unless it is Secure, Path=/ and
  // has no Domain, so a sibling subdomain cannot plant one. It requires HTTPS,
  // hence production only.
  get cookieName(): string {
    return this.isProduction ? '__Host-oauth_state' : 'oauth_state';
  }

  get cookieOptions() {
    return { httpOnly: true, secure: this.isProduction, sameSite: 'lax' as const, path: '/' };
  }

  get cookieMaxAgeMs(): number {
    return STATE_TTL_MS;
  }

  start(): GoogleRedirect {
    return this.beginFlow(this.requireConfig(), false);
  }

  async handleCallback(
    query: Record<string, unknown>,
    cookieHeader: string | undefined,
  ): Promise<GoogleRedirect> {
    const config = this.requireConfig();
    const fail = (code: GoogleLoginError): GoogleRedirect => ({
      location: `${config.webAppUrl}/login?error=${code}`,
      cookie: null,
    });

    // State first: nothing below is trusted until the browser proves it started this login.
    const state = typeof query.state === 'string' && query.state.length <= MAX_PARAM_LENGTH
      ? verifyState(this.stateSecret, query.state)
      : null;
    const flow = parseFlowCookie(readCookie(cookieHeader, this.cookieName));
    if (!state || !flow || !safeEqual(flow.nonce, state.n)) return fail('invalid_state');

    if (query.error !== undefined) {
      return fail(query.error === 'access_denied' ? 'access_denied' : 'google_failed');
    }
    const code = query.code;
    if (typeof code !== 'string' || code === '' || code.length > MAX_PARAM_LENGTH) return fail('google_failed');

    let identity;
    try {
      identity = await this.google.exchangeCode(config, { code, codeVerifier: flow.verifier, nonce: state.n });
    } catch (error) {
      this.logFailure('Google code exchange or ID token verification failed', error);
      return fail('google_failed');
    }

    // Drive access is required. The user can untick it on the consent screen.
    if (!identity.scopes.includes(DRIVE_FILE_SCOPE)) return fail('drive_permission_required');

    try {
      const email = identity.email.trim().toLowerCase();
      let user = await this.prisma.user.findUnique({ where: { googleSub: identity.sub } });
      if (!user) {
        const sameEmail = await this.prisma.user.findUnique({ where: { email } });
        if (sameEmail) {
          // Attach to an existing account only when Google vouches for the
          // address, and never over a different Google account already linked.
          if (!identity.emailVerified || sameEmail.googleSub) {
            this.logger.warn('Google login refused: email belongs to an account that cannot be linked');
            return fail('google_failed');
          }
          user = sameEmail;
        }
      }

      // Google only returns a refresh token on first consent. If we have none
      // and the user has none stored, restart once with prompt=consent to get one.
      if (!identity.refreshToken && !user?.googleRefreshTokenEnc) {
        if (state.r) {
          this.logger.warn('Google returned no refresh token even after a consent prompt');
          return fail('google_failed');
        }
        return this.beginFlow(config, true);
      }

      // Never overwrite a stored token with an empty one.
      const refreshTokenEnc = identity.refreshToken ? this.encryption.encrypt(identity.refreshToken) : null;
      if (user) {
        if (user.googleSub !== identity.sub || refreshTokenEnc) {
          user = await this.prisma.user.update({
            where: { id: user.id },
            data: { googleSub: identity.sub, ...(refreshTokenEnc ? { googleRefreshTokenEnc: refreshTokenEnc } : {}) },
          });
        }
      } else {
        user = await this.prisma.user.create({
          data: {
            email,
            name: this.displayName(identity.name, email),
            googleSub: identity.sub,
            googleRefreshTokenEnc: refreshTokenEnc,
          },
        });
      }

      // The token travels in the URL fragment so it is never sent to a server
      // or written to an access log.
      const token = this.auth.issueAccessToken(user);
      return { location: `${config.webAppUrl}/auth/callback#token=${encodeURIComponent(token)}`, cookie: null };
    } catch (error) {
      this.logFailure('Google login could not be completed', error);
      return fail('google_failed');
    }
  }

  private beginFlow(config: GoogleConfig, retry: boolean): GoogleRedirect {
    const { token, nonce } = createState(this.stateSecret, { retry });
    const pkce = generatePkce();
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: retry ? 'consent' : 'select_account',
      state: token,
      nonce,
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256',
    });
    return {
      location: `${AUTHORIZATION_ENDPOINT}?${params.toString()}`,
      cookie: buildFlowCookie(nonce, pkce.verifier),
    };
  }

  private displayName(googleName: string | null, email: string): string {
    const name = googleName?.trim() || email.split('@')[0];
    return name.slice(0, MAX_NAME_LENGTH);
  }

  private get isProduction(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  private get stateSecret(): string {
    return this.config.get<string>('JWT_SECRET')!;
  }

  private readConfig() {
    return readGoogleConfig({
      NODE_ENV: this.config.get<string>('NODE_ENV'),
      GOOGLE_CLIENT_ID: this.config.get<string>('GOOGLE_CLIENT_ID'),
      GOOGLE_CLIENT_SECRET: this.config.get<string>('GOOGLE_CLIENT_SECRET'),
      GOOGLE_REDIRECT_URI: this.config.get<string>('GOOGLE_REDIRECT_URI'),
      WEB_APP_URL: this.config.get<string>('WEB_APP_URL'),
    });
  }

  // Thrown as 503 (not 404) so a misconfigured deployment is distinguishable
  // from a missing route.
  private requireConfig(): GoogleConfig {
    const result = this.readConfig();
    if (!result.enabled) {
      throw new ServiceUnavailableException('Google sign-in is not configured on this server');
    }
    return result.config;
  }

  // Logs the failure's type and Google's standard OAuth error code (e.g.
  // invalid_grant) only — never the message body, which could echo a code or token.
  private logFailure(message: string, error: unknown) {
    const oauthError = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
    const detail = typeof oauthError === 'string' && /^[a-z_]{1,64}$/.test(oauthError) ? ` (${oauthError})` : '';
    this.logger.warn(`${message}: ${error instanceof Error ? error.name : 'unknown error'}${detail}`);
  }
}

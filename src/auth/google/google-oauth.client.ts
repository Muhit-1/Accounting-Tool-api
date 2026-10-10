import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import type { GoogleConfig } from './google-config.js';
import { safeEqual } from './oauth-state.js';

export interface GoogleExchangeResult {
  // Google's stable account id.
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  // Scopes Google actually granted (the user can untick some on the consent screen).
  scopes: string[];
  refreshToken: string | null;
}

// The only code that talks to Google. Kept this thin so the login logic can be
// tested against a stub with no network.
@Injectable()
export class GoogleOAuthClient {
  async exchangeCode(
    config: GoogleConfig,
    params: { code: string; codeVerifier: string; nonce: string },
  ): Promise<GoogleExchangeResult> {
    const client = new OAuth2Client({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    });
    const { tokens } = await client.getToken({ code: params.code, codeVerifier: params.codeVerifier });
    if (!tokens.id_token) throw new Error('Google returned no ID token');

    // Verifies signature, issuer, expiry and that the audience is our client ID.
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId });
    const payload = ticket.getPayload();
    if (!payload?.sub) throw new Error('ID token has no subject');
    if (typeof payload.email !== 'string' || payload.email.trim() === '') throw new Error('ID token has no email');
    // Ties the ID token to this login attempt (we sent the nonce with the request).
    if (typeof payload.nonce !== 'string' || !safeEqual(payload.nonce, params.nonce)) {
      throw new Error('ID token nonce mismatch');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' ? payload.name : null,
      scopes: (tokens.scope ?? '').split(/\s+/).filter(Boolean),
      refreshToken: tokens.refresh_token || null,
    };
  }
}

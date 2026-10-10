// Everything Google sign-in needs from the environment, parsed once and in one
// place so main.ts (fail fast on a malformed value) and the service (503 when
// absent) cannot disagree about what "configured" means.
export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  // Exact web origin (scheme + host[:port], no trailing slash).
  webAppUrl: string;
}

export type GoogleConfigResult =
  | { enabled: true; config: GoogleConfig }
  | { enabled: false; missing: string[]; configured: string[] };

export const GOOGLE_CALLBACK_PATH = '/auth/google/callback';

const REQUIRED = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'WEB_APP_URL'] as const;

function present(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function parseUrl(name: string, value: string, httpsRequired: boolean): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
  const allowed = httpsRequired ? ['https:'] : ['https:', 'http:'];
  if (!allowed.includes(url.protocol)) {
    throw new Error(`${name} must use ${httpsRequired ? 'https' : 'http or https'}`);
  }
  return url;
}

// Returns `enabled: false` (never throws) when any variable is missing so the
// app still boots without Google credentials. Throws only for a value that is
// present but wrong — that is a deployment mistake worth failing loudly on,
// and checking here means a bad redirect URI is caught at boot instead of
// after a user has been bounced through Google's consent screen.
export function readGoogleConfig(env: Record<string, string | undefined>): GoogleConfigResult {
  const missing = REQUIRED.filter((name) => !present(env[name]));
  if (missing.length > 0) {
    return { enabled: false, missing, configured: REQUIRED.filter((name) => present(env[name])) };
  }

  const isProduction = env.NODE_ENV === 'production';
  const webAppUrl = env.WEB_APP_URL!.trim();
  const redirectUri = env.GOOGLE_REDIRECT_URI!.trim();

  const web = parseUrl('WEB_APP_URL', webAppUrl, isProduction);
  if (web.origin !== webAppUrl) {
    throw new Error('WEB_APP_URL must be the exact web origin: scheme and host only, no path and no trailing slash');
  }
  const redirect = parseUrl('GOOGLE_REDIRECT_URI', redirectUri, isProduction);
  if (redirect.pathname !== GOOGLE_CALLBACK_PATH || redirect.search !== '' || redirect.hash !== '') {
    throw new Error(`GOOGLE_REDIRECT_URI must end in ${GOOGLE_CALLBACK_PATH} (and have no query or fragment)`);
  }

  return {
    enabled: true,
    config: {
      clientId: env.GOOGLE_CLIENT_ID!.trim(),
      clientSecret: env.GOOGLE_CLIENT_SECRET!.trim(),
      redirectUri,
      webAppUrl,
    },
  };
}

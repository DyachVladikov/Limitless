import { ApiError } from './errors';

const developmentOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8080',
];

export function configurationError(): ApiError {
  return new ApiError(503, 'AUTH_CONFIGURATION', 'Authentication is not configured');
}

export function openLocalApi() {
  return process.env.NODE_ENV === 'development';
}

export function allowedOrigins(): Set<string> {
  const configured = process.env.APP_ORIGINS?.trim();
  if (!configured && process.env.NODE_ENV === 'production') throw configurationError();
  const origins = configured ? configured.split(',').map((value) => value.trim()) : [];
  if (openLocalApi()) origins.push(...developmentOrigins);
  else if (!origins.length) origins.push(...developmentOrigins);
  if (origins.length > 32) throw configurationError();
  for (const origin of origins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw configurationError();
    }
    // Exact origins only: no wildcard, userinfo, paths, query, fragments or opaque origins.
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.hostname.includes('*')) {
      throw configurationError();
    }
  }
  return new Set(origins);
}

export function requiredSecret(name: 'SESSION_SECRET' | 'CRON_SECRET'): string {
  const value = process.env[name];
  if (
    !value ||
    Buffer.byteLength(value, 'utf8') < 32 ||
    Buffer.byteLength(value, 'utf8') > 4096 ||
    value.trim() !== value
  ) {
    throw configurationError();
  }
  return value;
}

export function ownerConfiguration() {
  const passwordHash = process.env.OWNER_PASSWORD_HASH;
  // Only the supported, bounded work factors are accepted; env typos cannot cause
  // unbounded allocations or silently downgrade password hashing.
  // Colons survive Next.js .env interpolation without additional escaping.
  const fields = /^scrypt:32768:8:1:([0-9a-f]{64}):([0-9a-f]{64})$/.exec(passwordHash ?? '');
  if (!fields || !passwordHash) throw configurationError();
  const secret = requiredSecret('SESSION_SECRET');
  const sameSite = process.env.SESSION_COOKIE_SAMESITE ?? 'lax';
  if (sameSite !== 'lax' && sameSite !== 'none') throw configurationError();
  const secure = process.env.NODE_ENV === 'production' || sameSite === 'none';
  return {
    passwordHash,
    salt: Buffer.from(fields[1], 'hex'),
    digest: Buffer.from(fields[2], 'hex'),
    secret,
    sameSite: sameSite === 'none' ? 'None' : 'Lax',
    secure,
    cookieName: secure ? '__Host-limitless_session' : 'limitless_session',
  };
}

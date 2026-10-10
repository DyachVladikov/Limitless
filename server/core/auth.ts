import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { ownerConfiguration, requiredSecret } from './auth-config';
import { ApiError } from './errors';
import { guardOrigin, readBody, respond } from './http';

type OwnerConfiguration = ReturnType<typeof ownerConfiguration>;
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 30;
const MAX_PARALLEL_HASHES = 2;
// Fixed-size, process-wide budget: spoofing X-Forwarded-For cannot evade it.
// Multiple instances still require a shared limiter at the trusted edge.
let loginWindow = { start: Date.now(), attempts: 0 };
let hashing = 0;

function reserveLogin(): void {
  const now = Date.now();
  if (now < loginWindow.start || now - loginWindow.start >= LOGIN_WINDOW_MS) {
    loginWindow = { start: now, attempts: 0 };
  }
  if (loginWindow.attempts >= MAX_LOGIN_ATTEMPTS || hashing >= MAX_PARALLEL_HASHES) {
    throw new ApiError(429, 'RATE_LIMITED', 'Too many login attempts; try again later');
  }
  loginWindow.attempts++;
}

function signingKey(config: OwnerConfiguration): Buffer {
  // Changing either the password hash or SESSION_SECRET revokes all sessions.
  return createHmac('sha256', config.secret).update('limitless-owner-session-key:v1\0').update(config.passwordHash).digest();
}

function sign(payload: string, config: OwnerConfiguration): string {
  return createHmac('sha256', signingKey(config)).update(`v1.${payload}`).digest('base64url');
}

function newSession(config: OwnerConfiguration): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ sub: 'owner', iat: now, exp: now + SESSION_SECONDS, nonce: randomBytes(16).toString('hex') })).toString('base64url');
  return `v1.${payload}.${sign(payload, config)}`;
}

function cookieToken(request: Request, config: OwnerConfiguration): string | null {
  const header = request.headers.get('cookie');
  if (!header || header.length > 8192) return null;
  const matches = header.split(';').map(value => value.trim()).filter(value => value.slice(0, value.indexOf('=')) === config.cookieName);
  // Ambiguous duplicate cookies are rejected instead of depending on proxy order.
  return matches.length === 1 ? matches[0].slice(matches[0].indexOf('=') + 1) : null;
}

function authenticated(request: Request, config: OwnerConfiguration): boolean {
  const token = cookieToken(request, config);
  if (!token || token.length > 2048) return false;
  const parts = /^v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!parts) return false;
  const signature = Buffer.from(parts[2], 'base64url');
  const expected = Buffer.from(sign(parts[1], config), 'base64url');
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    return payload?.sub === 'owner'
      && Number.isSafeInteger(payload.iat) && Number.isSafeInteger(payload.exp)
      && payload.iat <= now + 30 && payload.exp > now
      && payload.exp - payload.iat === SESSION_SECONDS
      && typeof payload.nonce === 'string' && /^[0-9a-f]{32}$/.test(payload.nonce);
  } catch { return false; }
}

function sessionCookie(config: OwnerConfiguration, token: string, expire = false): string {
  const maxAge = expire ? 0 : SESSION_SECONDS;
  const expires = expire ? new Date(0) : new Date(Date.now() + SESSION_SECONDS * 1000);
  return `${config.cookieName}=${token}; Path=/; HttpOnly${config.secure ? '; Secure' : ''}; SameSite=${config.sameSite}; Max-Age=${maxAge}; Expires=${expires.toUTCString()}`;
}

async function verifyPassword(password: string, config: OwnerConfiguration): Promise<boolean> {
  if (hashing >= MAX_PARALLEL_HASHES) throw new ApiError(429, 'RATE_LIMITED', 'Too many login attempts; try again later');
  hashing++;
  try {
    const candidate = await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, config.salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, derived) => error ? reject(error) : resolve(derived));
    });
    return timingSafeEqual(candidate, config.digest);
  } finally {
    hashing--;
  }
}

export async function handleAuth(request: Request, path: string): Promise<Response | null> {
  if (!['/auth/login', '/auth/logout', '/auth/session'].includes(path)) return null;
  guardOrigin(request);
  const expectedMethod = path === '/auth/session' ? 'GET' : 'POST';
  if (request.method !== expectedMethod) throw new ApiError(405, 'METHOD_NOT_ALLOWED', `Use ${expectedMethod} for this endpoint`);
  const config = ownerConfiguration();

  if (path === '/auth/session') return respond(request, { authenticated: authenticated(request, config) });
  if (path === '/auth/logout') {
    const response = respond(request, { authenticated: false });
    response.headers.set('Set-Cookie', sessionCookie(config, '', true));
    return response;
  }

  reserveLogin();
  const body = await readBody(request);
  if (Object.keys(body).some(key => key !== 'password') || typeof body.password !== 'string' || body.password.length === 0 || Buffer.byteLength(body.password, 'utf8') > 1024) {
    throw new ApiError(400, 'INVALID_CREDENTIALS', 'Provide a password of at most 1024 bytes');
  }
  if (!await verifyPassword(body.password, config)) throw new ApiError(401, 'UNAUTHORIZED', 'Invalid credentials');
  const response = respond(request, { authenticated: true });
  response.headers.set('Set-Cookie', sessionCookie(config, newSession(config)));
  return response;
}

export async function requireOwner(request: Request): Promise<void> {
  if (!authenticated(request, ownerConfiguration())) throw new ApiError(401, 'UNAUTHORIZED', 'Owner authentication is required');
}

export function requireJob(request: Request): void {
  const secret = requiredSecret('CRON_SECRET');
  const match = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') ?? '');
  const candidate = Buffer.from(match?.[1] ?? '', 'utf8');
  const expected = Buffer.from(secret, 'utf8');
  if (!match || candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Job authentication is required');
  }
}

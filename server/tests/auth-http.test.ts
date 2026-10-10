import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { scryptSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ApiError } from '../core/errors';
import { handleAuth, requireJob, requireOwner } from '../core/auth';
import { guardOrigin, preflight, readBody, respond, respondError } from '../core/http';

const origin = 'https://app.example.test';
const password = 'a long test owner password';
const salt = Buffer.alloc(32, 19);
const passwordHash = `scrypt:32768:8:1:${salt.toString('hex')}:${scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('hex')}`;
const environment = { ...process.env };
const realNow = Date.now;
let clock = Date.now();

beforeEach(() => {
  Object.assign(process.env, { NODE_ENV: 'production' });
  process.env.APP_ORIGINS = origin;
  process.env.OWNER_PASSWORD_HASH = passwordHash;
  process.env.SESSION_SECRET = 'test-secret-with-at-least-32-bytes-only-for-tests';
  process.env.CRON_SECRET = 'test-cron-secret-with-at-least-32-bytes';
  delete process.env.SESSION_COOKIE_SAMESITE;
  clock += 10 * 60 * 1000;
  Date.now = () => clock;
});

afterEach(() => {
  Date.now = realNow;
  for (const name of ['NODE_ENV', 'APP_ORIGINS', 'OWNER_PASSWORD_HASH', 'SESSION_SECRET', 'CRON_SECRET', 'SESSION_COOKIE_SAMESITE']) {
    if (environment[name] === undefined) delete process.env[name];
    else process.env[name] = environment[name];
  }
});

function request(path: string, options: RequestInit = {}) {
  const headers = new Headers({ origin, 'x-requested-with': 'Limitless', ...Object.fromEntries(new Headers(options.headers)) });
  return new Request(`https://api.example.test/api${path}`, { ...options, headers });
}

function login(value: unknown = password) {
  return handleAuth(request('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: value }) }), '/auth/login');
}

function status(expected: number) {
  return (error: unknown) => error instanceof ApiError && error.status === expected;
}

async function sessionCookie() {
  const response = await login();
  assert.equal(response?.status, 200);
  return response!.headers.get('set-cookie')!.split(';')[0];
}

test('valid owner login authenticates only its signed cookie', async () => {
  const cookie = await sessionCookie();
  await requireOwner(request('/profile', { headers: { cookie } }));
  await assert.rejects(requireOwner(request('/profile')), status(401));
  const token = cookie.slice(cookie.indexOf('=') + 1);
  const parts = token.split('.');
  parts[1] = (parts[1].startsWith('A') ? 'B' : 'A') + parts[1].slice(1);
  await assert.rejects(requireOwner(request('/profile', { headers: { cookie: `${cookie.split('=')[0]}=${parts.join('.')}` } })), status(401));
  await assert.rejects(requireOwner(request('/profile', { headers: { cookie: cookie + '; ' + cookie } })), status(401));
});

test('bad passwords and oversized passwords never issue a session', async () => {
  await assert.rejects(login('incorrect password'), status(401));
  await assert.rejects(login('x'.repeat(1025)), status(400));
  await assert.rejects(login({ toString: password }), status(400));
});

test('sessions expire and password or signing-secret changes invalidate them', async () => {
  const cookie = await sessionCookie();
  clock += 7 * 24 * 60 * 60 * 1000;
  await assert.rejects(requireOwner(request('/profile', { headers: { cookie } })), status(401));
  clock -= 7 * 24 * 60 * 60 * 1000;
  process.env.OWNER_PASSWORD_HASH = passwordHash.slice(0, -1) + (passwordHash.endsWith('0') ? '1' : '0');
  await assert.rejects(requireOwner(request('/profile', { headers: { cookie } })), status(401));
  process.env.OWNER_PASSWORD_HASH = passwordHash;
  process.env.SESSION_SECRET = 'replacement-secret-with-at-least-32-bytes';
  await assert.rejects(requireOwner(request('/profile', { headers: { cookie } })), status(401));
});

test('production cookies are host-only HttpOnly Secure and logout uses identical scope', async () => {
  const response = await login();
  const cookie = response!.headers.get('set-cookie')!;
  assert.match(cookie, /^__Host-limitless_session=/);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; SameSite=Lax/);
  assert.match(cookie, /; Path=\//);
  assert.match(cookie, /; Max-Age=604800/);
  assert.doesNotMatch(cookie, /Domain=/i);
  const logout = await handleAuth(request('/auth/logout', { method: 'POST' }), '/auth/logout');
  assert.equal(logout?.status, 200);
  assert.match(logout!.headers.get('set-cookie')!, /^__Host-limitless_session=; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=0;/);
  assert.equal(response!.headers.get('cache-control'), 'no-store');
});

test('cross-site cookies require an explicit option and always use Secure', async () => {
  Object.assign(process.env, { NODE_ENV: 'development' });
  process.env.SESSION_COOKIE_SAMESITE = 'none';
  const response = await login();
  assert.match(response!.headers.get('set-cookie')!, /; SameSite=None/);
  assert.match(response!.headers.get('set-cookie')!, /; Secure/);
  process.env.SESSION_COOKIE_SAMESITE = 'unexpected';
  await assert.rejects(login(), status(503));
});

test('auth endpoints report session state without profile data and enforce methods', async () => {
  let response = await handleAuth(request('/auth/session'), '/auth/session');
  assert.deepEqual(await response!.json(), { authenticated: false });
  const cookie = await sessionCookie();
  response = await handleAuth(request('/auth/session', { headers: { cookie } }), '/auth/session');
  assert.deepEqual(await response!.json(), { authenticated: true });
  await assert.rejects(handleAuth(request('/auth/login'), '/auth/login'), status(405));
  await assert.rejects(handleAuth(request('/auth/session', { method: 'POST' }), '/auth/session'), status(405));
  assert.equal(await handleAuth(request('/profile'), '/profile'), null);
});

test('authentication fails closed for absent or malformed security configuration', async () => {
  for (const missing of ['OWNER_PASSWORD_HASH', 'SESSION_SECRET']) {
    const value = process.env[missing];
    delete process.env[missing];
    await assert.rejects(login(), status(503));
    await assert.rejects(requireOwner(request('/profile')), status(503));
    process.env[missing] = value;
  }
  for (const hash of ['plaintext', passwordHash.replace('32768', '1073741824'), passwordHash.replace(':8:', ':64:'), passwordHash.replace(':1:', ':999:'), passwordHash + 'ff']) {
    process.env.OWNER_PASSWORD_HASH = hash;
    await assert.rejects(login(), status(503));
  }
  process.env.OWNER_PASSWORD_HASH = passwordHash;
  process.env.SESSION_SECRET = 'short';
  await assert.rejects(login(), status(503));
});

test('login has a global throttle which spoofed forwarded addresses cannot bypass', async () => {
  let denied = false;
  for (let i = 0; i < 50; i++) {
    try {
      await handleAuth(request('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `192.0.2.${i}` }, body: JSON.stringify({ password: 'wrong' }) }), '/auth/login');
      assert.fail('Incorrect credentials must not authenticate');
    } catch (error) {
      assert.ok(error instanceof ApiError);
      if (error.status === 429) { denied = true; break; }
      assert.equal(error.status, 401);
    }
  }
  assert.equal(denied, true);
  await assert.rejects(login(), status(429));
  clock += 10 * 60 * 1000;
  assert.equal((await login())?.status, 200);
});

test('cron authorization requires its own strong bearer secret and rejects owner cookies', async () => {
  const cookie = await sessionCookie();
  assert.throws(() => requireJob(request('/jobs/rollover', { headers: { cookie } })), status(401));
  assert.throws(() => requireJob(request('/jobs/rollover', { headers: { authorization: 'Bearer wrong' } })), status(401));
  requireJob(request('/jobs/rollover', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
  delete process.env.CRON_SECRET;
  assert.throws(() => requireJob(request('/jobs/rollover')), status(503));
  process.env.CRON_SECRET = 'short';
  assert.throws(() => requireJob(request('/jobs/rollover', { headers: { authorization: 'Bearer short' } })), status(503));
});

test('origin guard rejects unknown origins on reads and writes, including login', async () => {
  for (const method of ['GET', 'POST']) {
    assert.throws(() => guardOrigin(request('/profile', { method, headers: { origin: 'https://evil.example' } })), status(403));
  }
  await assert.rejects(handleAuth(request('/auth/login', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ password }) }), '/auth/login'), status(403));
  assert.throws(() => guardOrigin(request('/profile', { method: 'POST', headers: { origin: 'null' } })), status(403));
});

test('unsafe requests require Origin and the custom header while cron bearer requests remain usable', () => {
  guardOrigin(request('/profile', { method: 'POST' }));
  assert.throws(() => guardOrigin(new Request('https://api.example.test/api/profile', { method: 'POST' })), status(403));
  assert.throws(() => guardOrigin(new Request('https://api.example.test/api/profile', { method: 'POST', headers: { origin } })), status(403));
  assert.throws(() => guardOrigin(new Request('https://api.example.test/api/profile', { method: 'POST', headers: { authorization: 'Bearer value' } })), status(403));
  guardOrigin(new Request('https://api.example.test/api/jobs/rollover', { method: 'POST', headers: { authorization: 'Bearer value' } }));
  assert.throws(() => guardOrigin(new Request('https://api.example.test/api/profile', { headers: { 'sec-fetch-site': 'cross-site' } })), status(403));
});

test('CORS only reflects exact configured origins with credentials and refuses wildcard configuration', () => {
  const response = respond(request('/profile'), { value: 1 });
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  assert.match(response.headers.get('vary')!, /Origin/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(respond(request('/profile', { headers: { origin: 'https://evil.example' } }), {}).headers.get('access-control-allow-origin'), null);
  process.env.APP_ORIGINS = '*';
  assert.throws(() => guardOrigin(request('/profile')), status(503));
  delete process.env.APP_ORIGINS;
  assert.throws(() => guardOrigin(request('/profile')), status(503));
  const error = respondError(request('/profile'), new Error('configuration secret'));
  assert.equal(error.status, 500);
});

test('preflight allows permitted methods and headers, rejecting foreign or unsupported requests', () => {
  const response = preflight(request('/profile', { method: 'OPTIONS', headers: { 'access-control-request-method': 'PATCH', 'access-control-request-headers': 'content-type,x-requested-with' } }));
  assert.equal(response.status, 204);
  assert.match(response.headers.get('access-control-allow-methods')!, /PATCH/);
  assert.match(response.headers.get('access-control-allow-headers')!, /X-Requested-With/i);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.throws(() => preflight(request('/profile', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } })), status(403));
  assert.throws(() => preflight(request('/profile', { method: 'OPTIONS', headers: { 'access-control-request-method': 'TRACE' } })), status(403));
  assert.throws(() => preflight(request('/profile', { method: 'OPTIONS', headers: { 'access-control-request-method': 'POST', 'access-control-request-headers': 'X-Untrusted' } })), status(403));
});

test('JSON body parsing enforces objects, JSON media type, valid JSON, and actual streamed byte limits', async () => {
  const json = (body: string, headers: Record<string, string> = {}) => request('/profile', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', ...headers }, body });
  assert.deepEqual(await readBody(json('{"name":"owner"}')), { name: 'owner' });
  assert.deepEqual(await readBody(request('/profile')), {});
  for (const body of ['[]', 'null', 'true', '4', '{broken', '']) await assert.rejects(readBody(json(body)), status(400));
  await assert.rejects(readBody(json('{}', { 'content-type': 'text/plain' })), status(415));
  await assert.rejects(readBody(json('{}', { 'content-length': '65537' })), status(413));
  await assert.rejects(readBody(json(JSON.stringify({ text: 'a'.repeat(65536) }), { 'content-length': '2' })), status(413));
  let cancelled = false;
  const chunks = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(8192)); },
    cancel() { cancelled = true; },
  });
  const streamed = new Request('https://api.example.test/api/profile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: chunks, duplex: 'half' } as RequestInit);
  await assert.rejects(readBody(streamed), status(413));
  assert.equal(cancelled, true);
});

test('error responses preserve intended API errors but never expose database or runtime internals', async () => {
  const known = respondError(request('/profile'), new ApiError(409, 'CONFLICT', 'Version has changed', { version: '2' }));
  assert.equal(known.status, 409);
  assert.deepEqual(await known.json(), { error: { code: 'CONFLICT', message: 'Version has changed', details: { version: '2' } } });
  for (const [code, expected] of [['23505', 409], ['23503', 409], ['23514', 400], ['22P02', 400], ['40001', 409], ['40P01', 409], ['XX000', 500]] as const) {
    const response = respondError(request('/profile'), { code, message: 'private SQL table password', detail: 'sensitive query parameters' });
    assert.equal(response.status, expected);
    assert.doesNotMatch(await response.text(), /private|password|sensitive|parameters|SQL/);
  }
  assert.doesNotMatch(await respondError(request('/profile'), new Error('sensitive environment')).text(), /sensitive/);
});

test('password setup script creates usable salted hashes without taking credentials in arguments', async () => {
  const script = fileURLToPath(new URL('../scripts/hash-password.mjs', import.meta.url));
  const generated = spawnSync(process.execPath, [script], { input: password + '\n', encoding: 'utf8' });
  assert.equal(generated.status, 0, generated.stderr);
  assert.match(generated.stdout.trim(), /^scrypt:32768:8:1:[0-9a-f]{64}:[0-9a-f]{64}$/);
  assert.doesNotMatch(generated.stdout + generated.stderr, new RegExp(password));
  // A generated hash must survive the real .env loader used by Next.js.
  const dotenv = spawnSync(process.execPath, ['-e', `
    const { processEnv } = require('@next/env');
    const hash = require('node:fs').readFileSync(0, 'utf8').trim();
    const [, parsed] = processEnv([{ path: '.env', contents: 'LIMITLESS_SETUP_TEST_HASH=' + hash, env: {} }]);
    process.stdout.write(parsed.LIMITLESS_SETUP_TEST_HASH);
  `], { input: generated.stdout, encoding: 'utf8', cwd: fileURLToPath(new URL('../', import.meta.url)) });
  assert.equal(dotenv.status, 0, dotenv.stderr);
  assert.equal(dotenv.stdout, generated.stdout.trim());
  process.env.OWNER_PASSWORD_HASH = generated.stdout.trim();
  assert.equal((await login())?.status, 200);
  const again = spawnSync(process.execPath, [script], { input: password + '\n', encoding: 'utf8' });
  assert.equal(again.status, 0, again.stderr);
  assert.notEqual(generated.stdout, again.stdout);
  for (const input of ['', 'short', 'a'.repeat(1025), 'first password\nsecond password']) {
    const failure = spawnSync(process.execPath, [script], { input, encoding: 'utf8' });
    assert.equal(failure.status, 1);
    assert.equal(failure.stdout, '');
  }
  const argument = spawnSync(process.execPath, [script, password], { encoding: 'utf8' });
  assert.equal(argument.status, 1);
  assert.equal(argument.stdout, '');
  assert.doesNotMatch(argument.stderr, new RegExp(password));
});

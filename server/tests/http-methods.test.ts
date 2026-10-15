import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import * as session from '../app/api/auth/session/route';
import * as profile from '../app/api/profile/route';

const original = { ...process.env };
const keys = ['NODE_ENV', 'APP_ORIGINS', 'OWNER_PASSWORD_HASH', 'SESSION_SECRET'];

beforeEach(() => {
  Object.assign(process.env, { NODE_ENV: 'production' });
  process.env.APP_ORIGINS = 'https://app.example.test';
  process.env.OWNER_PASSWORD_HASH = `scrypt:32768:8:1:${'00'.repeat(32)}:${'11'.repeat(32)}`;
  process.env.SESSION_SECRET = 'test-only-secret-with-more-than-32-bytes';
});

afterEach(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

test('native session HEAD has the GET status and headers, without a body', async () => {
  const url = 'https://api.example.test/api/auth/session';
  const get = await session.GET(new Request(url));
  const head = await session.HEAD(new Request(url, { method: 'HEAD' }));
  assert.equal(get.status, 200);
  assert.equal(head.status, get.status);
  assert.equal(head.headers.get('content-type'), get.headers.get('content-type'));
  assert.equal(await head.text(), '');
});

test('unsupported methods return JSON 405 and the actual allowed methods', async () => {
  const response = await profile.DELETE(new Request('https://api.example.test/api/profile', {
    method: 'DELETE',
    headers: { Origin: 'https://app.example.test', 'X-Requested-With': 'Limitless' },
  }));
  assert.equal(response.status, 405);
  assert.equal((await response.json()).error.code, 'METHOD_NOT_ALLOWED');
  const allowed = response.headers.get('allow')?.split(', ').sort();
  assert.deepEqual(allowed, ['GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST']);
});

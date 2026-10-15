import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('../API.md', import.meta.url), 'utf8');
const endpoints = new Set<string>();

for (const line of api.split('\n')) {
  // В API.md есть таблицы «метод | путь» и «метод + путь | описание».
  const plain = line.replaceAll('`', '');
  const match = plain.match(/^\|\s*(GET|POST|PATCH|PUT|DELETE)\s*(?:\|\s*)?(\/[^\s|?]+)/);
  if (match) endpoints.add(`${match[1]} ${match[2]}`);
}
for (const path of ['/gym/programs/:id', '/gym/exercises/:id', '/subjects/:id', '/books/:id']) {
  endpoints.add(`DELETE ${path}`);
}

test('every endpoint from API.md has a native Next.js route and method', async () => {
  assert.equal(endpoints.size, 63, 'the API inventory must include all documented methods');
  for (const endpoint of endpoints) {
    const [method, path] = endpoint.split(' ');
    const directory = path.replaceAll(/:([a-zA-Z]+)/g, '[$1]');
    const file = new URL(`../app/api${directory}/route.ts`, import.meta.url);
    assert.ok(existsSync(file), `Missing native route: ${endpoint}`);
    const route = await import(file.href);
    assert.equal(typeof route[method], 'function', `Missing handler: ${endpoint}`);
    const { methodNotAllowed } = await import('../core/system-request');
    assert.notEqual(route[method], methodNotAllowed, `Unsupported documented method: ${endpoint}`);
    assert.equal(typeof route.OPTIONS, 'function', `Missing CORS preflight: ${endpoint}`);
  }
});

test('every native game route requires the owner before accessing the database', async () => {
  const original = { ...process.env };
  Object.assign(process.env, {
    NODE_ENV: 'production',
    APP_ORIGINS: 'https://app.example.test',
    OWNER_PASSWORD_HASH: `scrypt:32768:8:1:${'00'.repeat(32)}:${'11'.repeat(32)}`,
    SESSION_SECRET: 'test-only-secret-with-more-than-32-bytes',
  });
  try {
    for (const endpoint of endpoints) {
      const [method, path] = endpoint.split(' ');
      if (path === '/health' || path.startsWith('/auth/') || path.startsWith('/jobs/')) continue;
      const directory = path.replaceAll(/:([a-zA-Z]+)/g, '[$1]');
      const route = await import(new URL(`../app/api${directory}/route.ts`, import.meta.url).href);
      const id = '00000000-0000-4000-8000-000000000001';
      const request = new Request(`https://api.example.test/api${path.replace(':id', id)}`, {
        method,
        headers: { Origin: 'https://app.example.test', 'X-Requested-With': 'Limitless' },
      });
      const response = await route[method](request, { params: Promise.resolve({ id }) });
      assert.equal(response.status, 401, endpoint);
      assert.equal((await response.json()).error.code, 'UNAUTHORIZED', endpoint);
    }
  } finally {
    for (const key of ['NODE_ENV', 'APP_ORIGINS', 'OWNER_PASSWORD_HASH', 'SESSION_SECRET']) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});

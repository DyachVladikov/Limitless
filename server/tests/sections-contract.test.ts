import assert from 'node:assert/strict';
import test from 'node:test';
import { testRoutes as sectionRoutes } from './routes';
test('registers the agreed nutrition action', () => {
  assert.ok(sectionRoutes.some(r => r.method === 'POST' && r.path === '/nutrition/entries'));
});

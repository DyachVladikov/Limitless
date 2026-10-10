import assert from 'node:assert/strict';
import test from 'node:test';
import { sectionRoutes } from '../modules/sections/index';
test('registers the agreed nutrition action', () => {
  assert.ok(sectionRoutes.some(r => r.method === 'POST' && r.path === '/nutrition/entries'));
});

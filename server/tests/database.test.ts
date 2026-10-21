import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test, { type TestContext } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { Pool, type PoolClient } from 'pg';
import { transaction } from '../core/database';

async function isolatedDatabase(t: TestContext) {
  const previousUrl = process.env.DATABASE_URL;
  const previousSize = process.env.DATABASE_POOL_SIZE;
  process.env.DATABASE_URL = 'postgresql://test:test@localhost/limitless_test';
  process.env.DATABASE_POOL_SIZE = '1';
  const pg = new PGlite();
  t.after(async () => {
    t.mock.restoreAll();
    await pg.close();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (previousSize === undefined) delete process.env.DATABASE_POOL_SIZE;
    else process.env.DATABASE_POOL_SIZE = previousSize;
  });
  await pg.exec('CREATE TABLE notes (id integer PRIMARY KEY, days integer[], body text)');
  const connection = Object.assign(new EventEmitter(), {
    async query(sql: string, values: unknown[] = []) {
      // PGlite has no concurrent sessions and does not implement advisory locks.
      if (/^\s*SELECT pg_advisory_xact_lock\(1869376617,\s*1\)\s*;?\s*$/i.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      const result = /^\s*SET LOCAL /i.test(sql) && values.length === 0
        ? (await pg.exec(sql)).at(-1)!
        : await pg.query(sql, values);
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    },
    release() {},
  });
  t.mock.method(Pool.prototype, 'connect', async () => connection as unknown as PoolClient);
  return pg;
}

test('database transaction commits PostgreSQL arrays and literal text parameters', async (t) => {
  const pg = await isolatedDatabase(t);
  const body = "Owner's $1 stays text \\ untouched";
  await transaction(async (db) => {
    const result = await db.query(
      'INSERT INTO notes (id, days, body) VALUES (1, $1, $2) RETURNING days, body',
      [[1, 3, 5], body],
    );
    assert.deepEqual(result.rows, [{ days: [1, 3, 5], body }]);
  });
  // A missing COMMIT must not pass merely because this session can see its writes.
  await pg.exec('ROLLBACK');
  assert.deepEqual((await pg.query('SELECT days, body FROM notes')).rows, [
    { days: [1, 3, 5], body },
  ]);
});

test('database transaction rolls back earlier writes when a later statement fails', async (t) => {
  const pg = await isolatedDatabase(t);
  await assert.rejects(transaction(async (db) => {
    await db.query('INSERT INTO notes (id, body) VALUES (1, $1)', ['first write']);
    await db.query('INSERT INTO notes (id, body) VALUES (1, $1)', ['duplicate']);
  }), { code: '23505' });
  assert.deepEqual((await pg.query('SELECT id FROM notes')).rows, []);
});

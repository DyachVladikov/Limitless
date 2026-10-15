import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createTestDatabase, inTransaction } from './helpers';
import { createHandler } from './http-client';

test('HTTP action rolls back book progress and rewards when a completed quest depends on them', async () => {
  const previousMode = process.env.NODE_ENV;
  const previousOrigins = process.env.APP_ORIGINS;
  Object.assign(process.env, { NODE_ENV: 'development', APP_ORIGINS: 'http://localhost:3000' });
  const db = await createTestDatabase();
  const api = createHandler({
    runTransaction: run => inTransaction(db, run),
    now: () => '2026-10-15T09:00:00.000Z',
  });
  const call = (path: string, method = 'GET', body?: unknown) => api(new Request(
    `http://localhost:8080/api${path}`, {
      method,
      headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  ));
  try {
    assert.equal((await call('/profile', 'POST', { name: 'Owner' })).status, 201);
    const questId = randomUUID();
    await db.query(`
      INSERT INTO quests(id,title,description,required_rank,progress_mode,metric_key,target_count,progress_unit,reward_xp)
      VALUES($1,'Read a book','','E','metric','books_read',1,'books',10)
    `, [questId]);
    const id = randomUUID();
    const saved = await call('/books', 'POST', { id, title: 'Book', progressUnit: 'pages', totalUnits: 10, readUnits: 10 });
    assert.equal(saved.status, 201);
    const completed = await saved.json();
    assert.equal(completed.profile.totalExp, 10);
    assert.ok(completed.events.some((event: { type: string }) => event.type === 'quest_completed'));

    const undo = await call(`/books/${id}`, 'PATCH', { version: completed.data.version, readUnits: 0 });
    assert.equal(undo.status, 409);
    const error = (await undo.json()).error;
    assert.equal(error.code, 'COMPLETED_QUEST_DEPENDENCY');
    assert.deepEqual(error.details.questIds, [questId]);

    const after = await (await call(`/books/${id}`)).json();
    assert.equal(after.data.readUnits, 10);
    assert.equal(after.data.version, completed.data.version);
    assert.equal(after.profile.totalExp, 10);
  } finally {
    await db.close();
    for (const [key, value] of Object.entries({ NODE_ENV: previousMode, APP_ORIGINS: previousOrigins })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

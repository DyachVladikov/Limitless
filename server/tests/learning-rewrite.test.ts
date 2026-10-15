import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createBook, updateBook } from '../controllers/books';
import { mentorReactions } from '../controllers/mentors/reactions';
import { drawScenario, getCurrentScenario, saveScenarioAnswer } from '../controllers/scenarios';
import type { Input, Row } from '../core/types';
import { context, createTestDatabase } from './helpers';

function input(body: Row, id?: string): Input {
  return { body, params: id ? { id } : {}, query: new URLSearchParams() };
}

async function fixture() {
  const db = await createTestDatabase();
  await db.query("INSERT INTO profiles(id,name,current_day,day_balance_version) VALUES(1,'Test','2026-10-10','2026-10-10-v1')");
  return { db, ctx: await context(db) };
}

for (const field of ['readUnits', 'isArchived']) {
  test(`book creation rejects explicit null for ${field}`, async () => {
    const { db, ctx } = await fixture();
    try {
      await assert.rejects(createBook(ctx, input({
        id: randomUUID(), title: 'Book', progressUnit: 'pages', totalUnits: 100,
        [field]: null,
      })), { status: 400 });
      assert.equal((await db.query('SELECT COUNT(*)::integer AS count FROM books')).rows[0].count, 0);

      const book = await createBook(ctx, input({
        id: randomUUID(), title: 'Defaults', progressUnit: 'pages', totalUnits: 100,
      }));
      assert.equal(book.read_units, 0);
      assert.equal(book.is_archived, false);
    } finally {
      await db.close();
    }
  });

  test(`book updates reject null ${field} without resetting progress or archive`, async () => {
    const { db, ctx } = await fixture();
    try {
      const book = await createBook(ctx, input({
        id: randomUUID(), title: 'Book', progressUnit: 'pages', totalUnits: 100,
        readUnits: 40, isArchived: true,
      }));
      await assert.rejects(updateBook(ctx, input({
        version: book.version, [field]: null,
      }, book.id)), { status: 400 });

      const saved = (await db.query('SELECT * FROM books WHERE id = $1', [book.id])).rows[0];
      assert.equal(saved.read_units, 40);
      assert.equal(saved.is_archived, true);
      assert.equal(saved.version, book.version);
    } finally {
      await db.close();
    }
  });
}

for (const [name, patch] of [
  ['missing answer', {}],
  ['null answer', { userAnswer: null }],
  ['null submit flag', { userAnswer: 'Changed', submit: null }],
] as const) {
  test(`scenario rejects ${name} without deleting its draft`, async () => {
    const { db, ctx } = await fixture();
    try {
      const id = randomUUID();
      const attemptId = randomUUID();
      await db.query(
        "INSERT INTO scenarios(id,title,prompt,reference_answer,reward_xp,cooldown_days) VALUES($1,'Case','Question','Secret',10,1)",
        [id],
      );
      const issued = await drawScenario(ctx, input({ attemptId, expectedPreviousAttemptId: null }));
      assert.ok(issued);
      const draft = await saveScenarioAnswer(ctx, input({
        attemptId, version: issued.version, userAnswer: 'Existing draft',
      }, id));
      assert.ok(draft);

      await assert.rejects(saveScenarioAnswer(ctx, input({
        attemptId, version: draft.version, ...patch,
      }, id)), { status: 400 });

      const saved = await getCurrentScenario(ctx);
      assert.equal(saved?.user_answer, 'Existing draft');
      assert.equal(saved?.version, draft.version);
      assert.equal(saved?.answer_submitted_at, null);
      assert.equal(JSON.stringify(saved).includes('Secret'), false);

      const cleared = await saveScenarioAnswer(ctx, input({
        attemptId, version: draft.version, userAnswer: '', submit: false,
      }, id));
      assert.ok(cleared);
      assert.equal(cleared.user_answer, null);
      await assert.rejects(saveScenarioAnswer(ctx, input({
        attemptId, version: cleared.version, userAnswer: '', submit: true,
      }, id)), { status: 400 });
    } finally {
      await db.close();
    }
  });
}

test('rank events omit the mentor reaction when Gojo has no matching phrase', async () => {
  const db = await createTestDatabase();
  try {
    await db.query("INSERT INTO profiles(id,name,current_day,day_balance_version) VALUES(1,'Test','2026-10-10','2026-10-10-v1')");
    await db.query(
      "INSERT INTO mentors(id,name,section,images,phrases) VALUES('gojo','Gojo','home',$1,$2)",
      [JSON.stringify({ default: '/gojo.png' }), JSON.stringify([
        { id: 'idle', event: 'idle', mood: 'neutral', text: 'Ready' },
      ])],
    );
    const ctx = await context(db);
    ctx.events = [{ type: 'rank_up', fromRank: 'E', toRank: 'D' }];

    await mentorReactions(ctx, () => 0);

    assert.equal(Object.hasOwn(ctx.events[0], 'mentor'), false);
  } finally {
    await db.close();
  }
});

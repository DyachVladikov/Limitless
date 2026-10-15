import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createNutritionEntry, updateNutritionEntry } from '../controllers/nutrition/controller';
import { createWorkout, updateWorkout } from '../controllers/workouts/controller';
import { createProgram } from '../controllers/programs';
import { createExercise } from '../controllers/exercises';
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

test('nutrition replay uses the original default portion after an entry edit', async () => {
  const { db, ctx } = await fixture();
  try {
    const dishId = randomUUID();
    await db.query('INSERT INTO dishes(id,name,calories_per_portion,protein_per_portion,fat_per_portion,carbs_per_portion) VALUES($1,$2,100,2,3,4)', [dishId, 'Soup']);
    const body = { id: randomUUID(), gameDate: ctx.today, dishId };
    const entry = await createNutritionEntry(ctx, input(body));
    await updateNutritionEntry(ctx, input({
      version: entry.version,
      gameDate: ctx.today,
      portions: 2,
    }, entry.id));
    await assert.rejects(createNutritionEntry(ctx, input(body)), { status: 409 });
    assert.equal((await db.query('SELECT portions FROM nutrition_entries')).rows[0].portions, '2.000');
  } finally {
    await db.close();
  }
});

test('existing workout IDs do not make required creation fields optional', async () => {
  const { db, ctx } = await fixture();
  try {
    const body = { id: randomUUID(), kind: 'volleyball', performedOn: ctx.today, attended: true };
    await createWorkout(ctx, input(body));
    await assert.rejects(createWorkout(ctx, input({
      id: body.id,
      kind: body.kind,
      performedOn: body.performedOn,
    })), { status: 400 });
    await assert.rejects(createWorkout(ctx, input({
      id: body.id,
      kind: body.kind,
      attended: body.attended,
    })), { status: 400 });
  } finally {
    await db.close();
  }
});


test('catalog creation rejects null instead of applying numeric and boolean defaults', async () => {
  const { db, ctx } = await fixture();
  try {
    for (const field of ['isEnabled', 'sortOrder']) {
      await assert.rejects(createProgram(ctx, input({
        id: randomUUID(), name: 'Upper', [field]: null,
      })), { status: 400 }, field);
    }
    await assert.rejects(createExercise(ctx, input({
      id: randomUUID(), name: 'Press', muscleGroup: 'chest', isEnabled: null,
    })), { status: 400 });
  } finally {
    await db.close();
  }
});

test('volleyball edits reject explicit null attendance and date without changing the record', async () => {
  const { db, ctx } = await fixture();
  try {
    const workout = await createWorkout(ctx, input({
      id: randomUUID(), kind: 'volleyball', performedOn: ctx.today, attended: true,
    }));
    for (const field of ['attended', 'performedOn']) {
      await assert.rejects(updateWorkout(ctx, input({
        version: workout.version, [field]: null,
      }, workout.id)), { status: 400 }, field);
    }
    const saved = (await db.query('SELECT * FROM workouts WHERE id = $1', [workout.id])).rows[0];
    assert.equal(saved.version, workout.version);
    assert.equal(saved.attended, true);
  } finally {
    await db.close();
  }
});

test('gym workouts reject null result arrays and program edits', async () => {
  const { db, ctx } = await fixture();
  try {
    const program = await createProgram(ctx, input({ id: randomUUID(), name: 'Upper' }));
    const body = { id: randomUUID(), kind: 'gym', performedOn: ctx.today, programId: program.id };
    await assert.rejects(createWorkout(ctx, input({ ...body, results: null })), { status: 400 });
    const workout = await createWorkout(ctx, input(body));
    await assert.rejects(updateWorkout(ctx, input({
      version: workout.version, programId: null,
    }, workout.id)), { status: 400 });
  } finally {
    await db.close();
  }
});

test('manual nutrition edits reject explicit null macro values and title', async () => {
  const { db, ctx } = await fixture();
  try {
    const entry = await createNutritionEntry(ctx, input({
      id: randomUUID(), gameDate: ctx.today, title: 'Lunch',
      calories: 100, protein: 2, fat: 3, carbs: 4,
    }));
    for (const field of ['calories', 'protein', 'fat', 'carbs', 'title']) {
      await assert.rejects(updateNutritionEntry(ctx, input({
        version: entry.version, gameDate: ctx.today, [field]: null,
      }, entry.id)), { status: 400 }, field);
    }
    const saved = (await db.query('SELECT * FROM nutrition_entries WHERE id = $1', [entry.id])).rows[0];
    assert.equal(saved.version, entry.version);
    assert.equal(Number(saved.calories_per_portion), 100);
  } finally {
    await db.close();
  }
});

test('dish nutrition rejects null portions while dishId null still selects manual nutrition', async () => {
  const { db, ctx } = await fixture();
  try {
    const dishId = randomUUID();
    await db.query('INSERT INTO dishes(id,name,calories_per_portion,protein_per_portion,fat_per_portion,carbs_per_portion) VALUES($1,$2,100,2,3,4)', [dishId, 'Soup']);
    const body = { id: randomUUID(), gameDate: ctx.today, dishId };
    await assert.rejects(createNutritionEntry(ctx, input({ ...body, portions: null })), { status: 400 });
    const entry = await createNutritionEntry(ctx, input(body));
    await assert.rejects(updateNutritionEntry(ctx, input({
      version: entry.version, gameDate: ctx.today, portions: null,
    }, entry.id)), { status: 400 });
    const manual = await updateNutritionEntry(ctx, input({
      version: entry.version, gameDate: ctx.today, dishId: null,
      calories: 50, protein: 1, fat: 2, carbs: 3,
    }, entry.id));
    assert.equal(manual.dish_id, null);
    assert.equal(Number(manual.portions), 1);
    assert.equal(Number(manual.calories_per_portion), 50);
  } finally {
    await db.close();
  }
});

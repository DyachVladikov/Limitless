import type { GameContext, Input, Row } from '../core/types';
import { all, insert, one, update } from '../core/sql';
import { boolean, choice, expectVersion, only, optionalText, text, uuid } from '../core/validation';
import { pageLimit, pageOffset, rowById, sameValues } from '../core/inputs';

const muscleGroups = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'other'] as const;

export async function listExercises(ctx: GameContext, { query }: Input): Promise<Row[]> {
  const includeDisabled = query.get('includeDisabled') === 'true';
  return all(
    ctx.db,
    `
    SELECT * FROM exercises
    WHERE is_enabled OR $1
    ORDER BY name, id
  `,
    [includeDisabled],
  );
}

export async function getExercise(ctx: GameContext, { params }: Input): Promise<Row> {
  return rowById(ctx, 'exercises', uuid(params.id));
}

export async function getExerciseHistory(ctx: GameContext, { params, query }: Input): Promise<Row[]> {
  const exercise = await rowById(ctx, 'exercises', uuid(params.id));
  return all(
    ctx.db,
    `
    SELECT we.*, w.performed_on, w.program_name_snapshot
    FROM workout_exercises we
    JOIN workouts w ON w.id = we.workout_id
    WHERE we.exercise_id = $1
    ORDER BY w.performed_on DESC, w.created_at DESC, w.id DESC
    LIMIT $2 OFFSET $3
  `,
    [exercise.id, pageLimit(query, 3), pageOffset(query)],
  );
}

export async function createExercise(ctx: GameContext, { body }: Input): Promise<Row> {
  only(body, ['id', 'name', 'equipment', 'muscleGroup', 'note', 'isEnabled']);
  const id = uuid(body.id);
  const data = {
    name: text(body.name, 'name'),
    equipment: optionalText(body.equipment, 'equipment', 2000),
    muscle_group: choice(body.muscleGroup, 'muscleGroup', muscleGroups),
    note: optionalText(body.note, 'note', 2000),
    is_enabled: boolean(body.isEnabled === undefined ? true : body.isEnabled, 'isEnabled'),
  };
  const existing = await one(ctx.db, 'SELECT * FROM exercises WHERE id = $1', [id]);
  if (existing) {
    sameValues(existing, data);
    return existing;
  }
  return insert(ctx.db, 'exercises', { id, ...data });
}

export async function updateExercise(ctx: GameContext, { body, params }: Input): Promise<Row> {
  only(body, ['version', 'name', 'equipment', 'muscleGroup', 'note', 'isEnabled']);
  const exercise = await rowById(ctx, 'exercises', uuid(params.id));
  expectVersion(exercise, body.version);

  const patch: Row = {};
  if (body.name !== undefined) patch.name = text(body.name, 'name');
  if (body.equipment !== undefined) {
    patch.equipment = optionalText(body.equipment, 'equipment', 2000);
  }
  if (body.muscleGroup !== undefined) {
    patch.muscle_group = choice(body.muscleGroup, 'muscleGroup', muscleGroups);
  }
  if (body.note !== undefined) patch.note = optionalText(body.note, 'note', 2000);
  if (body.isEnabled !== undefined) patch.is_enabled = boolean(body.isEnabled, 'isEnabled');

  if (!Object.keys(patch).length) return exercise;
  return update(ctx.db, 'exercises', { id: exercise.id }, patch);
}

export async function disableExercise(ctx: GameContext, { body, params }: Input): Promise<Row> {
  only(body, ['version']);
  const exercise = await rowById(ctx, 'exercises', uuid(params.id));
  expectVersion(exercise, body.version);
  return update(ctx.db, 'exercises', { id: exercise.id }, { is_enabled: false });
}

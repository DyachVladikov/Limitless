import type { GameContext, Input, Row } from '../core/types';
import { all, insert, one, update } from '../core/sql';
import { boolean, expectVersion, integer, only, optionalText, text, uuid } from '../core/validation';
import { conflict, invalid, rowById, sameValues } from '../core/inputs';

async function programWithExercises(ctx: GameContext, program: Row): Promise<Row> {
  const exercises = await all(
    ctx.db,
    `
    SELECT e.*, pe.position, pe.version AS composition_version
    FROM program_exercises pe
    JOIN exercises e ON e.id = pe.exercise_id
    WHERE pe.program_id = $1
    ORDER BY pe.position
  `,
    [program.id],
  );
  return { ...program, exercises };
}

export async function listPrograms(ctx: GameContext, { query }: Input): Promise<Row[]> {
  const includeDisabled = query.get('includeDisabled') === 'true';
  return all(
    ctx.db,
    `
    SELECT * FROM workout_programs
    WHERE is_enabled OR $1
    ORDER BY sort_order, name, id
  `,
    [includeDisabled],
  );
}

export async function getProgram(ctx: GameContext, { params }: Input): Promise<Row> {
  const program = await rowById(ctx, 'workout_programs', uuid(params.id));
  return programWithExercises(ctx, program);
}

export async function createProgram(ctx: GameContext, { body }: Input): Promise<Row> {
  only(body, ['id', 'name', 'description', 'isEnabled', 'sortOrder']);
  const id = uuid(body.id);
  const data = {
    name: text(body.name, 'name'),
    description: optionalText(body.description, 'description', 10000),
    is_enabled: boolean(body.isEnabled === undefined ? true : body.isEnabled, 'isEnabled'),
    sort_order: integer(body.sortOrder === undefined ? 0 : body.sortOrder, 'sortOrder'),
  };
  const existing = await one(ctx.db, 'SELECT * FROM workout_programs WHERE id = $1', [id]);
  if (existing) {
    sameValues(existing, data);
    return existing;
  }
  return insert(ctx.db, 'workout_programs', { id, ...data });
}

export async function updateProgram(ctx: GameContext, { body, params }: Input): Promise<Row> {
  only(body, ['version', 'name', 'description', 'isEnabled', 'sortOrder']);
  const program = await rowById(ctx, 'workout_programs', uuid(params.id));
  expectVersion(program, body.version);

  const patch: Row = {};
  if (body.name !== undefined) patch.name = text(body.name, 'name');
  if (body.description !== undefined) {
    patch.description = optionalText(body.description, 'description', 10000);
  }
  if (body.isEnabled !== undefined) patch.is_enabled = boolean(body.isEnabled, 'isEnabled');
  if (body.sortOrder !== undefined) patch.sort_order = integer(body.sortOrder, 'sortOrder');

  if (!Object.keys(patch).length) return program;
  return update(ctx.db, 'workout_programs', { id: program.id }, patch);
}

export async function disableProgram(ctx: GameContext, { body, params }: Input): Promise<Row> {
  only(body, ['version']);
  const program = await rowById(ctx, 'workout_programs', uuid(params.id));
  expectVersion(program, body.version);
  return update(ctx.db, 'workout_programs', { id: program.id }, { is_enabled: false });
}

export async function replaceProgramExercises(ctx: GameContext, { body, params }: Input): Promise<Row> {
  only(body, ['version', 'exerciseIds']);
  const program = await rowById(ctx, 'workout_programs', uuid(params.id));
  expectVersion(program, body.version);

  if (!Array.isArray(body.exerciseIds) || body.exerciseIds.length > 200) {
    invalid('exerciseIds must be an array with at most 200 entries');
  }
  const ids = (body.exerciseIds as unknown[]).map((id) => uuid(id, 'exerciseId'));
  if (new Set(ids).size !== ids.length) invalid('Program exercises must not repeat');
  for (const id of ids) {
    const exercise = await rowById(ctx, 'exercises', id);
    if (!exercise.is_enabled) conflict('Disabled exercises cannot be added to a program');
  }

  await ctx.db.query('DELETE FROM program_exercises WHERE program_id = $1', [program.id]);
  for (const [position, exerciseId] of ids.entries()) {
    await insert(ctx.db, 'program_exercises', {
      program_id: program.id,
      exercise_id: exerciseId,
      position,
    });
  }
  // The composition is edited with the program's version, so advance that version too.
  const updated = await update(ctx.db, 'workout_programs', { id: program.id }, { name: program.name });
  return programWithExercises(ctx, updated);
}

import type { GameContext, Row } from '../../core/types';
import { all, insert, update } from '../../core/sql';
import { integer, object, only, uuid } from '../../core/validation';
import { conflict, decimal, invalid, sameValues } from '../../core/inputs';

export function parseWorkoutResults(value: unknown): Row[] {
  if (!Array.isArray(value) || value.length > 200) {
    invalid('results must be an array of at most 200 exercise results');
  }
  const ids = new Set<string>();
  return (value as unknown[]).map((item) => {
    const row = object(item);
    only(row, ['exerciseId', 'weightKg', 'repetitions']);
    const exerciseId = uuid(row.exerciseId, 'exerciseId');
    if (ids.has(exerciseId)) invalid('An exercise can only have one result per workout');
    ids.add(exerciseId);
    return {
      exercise_id: exerciseId,
      weight_kg: decimal(row.weightKg, 'weightKg', 999999.99),
      repetitions: integer(row.repetitions, 'repetitions', 1),
    };
  });
}

export async function workoutWithResults(ctx: GameContext, workout: Row): Promise<Row> {
  const results = await all(
    ctx.db,
    `
    SELECT * FROM workout_exercises
    WHERE workout_id = $1
    ORDER BY created_at, exercise_id
  `,
    [workout.id],
  );
  return { ...workout, results };
}

export function expectSameResults(saved: Row[], incoming: Row[]): void {
  if (saved.length !== incoming.length) conflict('This workout ID has different results');
  for (const result of incoming) {
    const existing = saved.find((row) => row.exercise_id === result.exercise_id);
    if (!existing) conflict('This workout ID has different exercises');
    sameValues(existing, result);
  }
}

export async function replaceWorkoutResults(
  ctx: GameContext,
  workout: Row,
  results: Row[],
  prior: Row[] = [],
): Promise<void> {
  const composition = await all(
    ctx.db,
    `
    SELECT e.* FROM program_exercises pe
    JOIN exercises e ON e.id = pe.exercise_id
    WHERE pe.program_id = $1
  `,
    [workout.program_id],
  );

  for (const result of results) {
    const existing = prior.find((row) => row.exercise_id === result.exercise_id);
    const exercise = composition.find((row) => row.id === result.exercise_id);
    if (!existing && (!exercise || !exercise.is_enabled)) {
      conflict('New results must belong to enabled exercises in the selected program');
    }
    const data = {
      ...result,
      exercise_name_snapshot: existing?.exercise_name_snapshot ?? exercise?.name,
    };
    const key = { workout_id: workout.id, exercise_id: result.exercise_id };
    if (existing) await update(ctx.db, 'workout_exercises', key, data);
    else await insert(ctx.db, 'workout_exercises', { workout_id: workout.id, ...data });
  }

  for (const old of prior) {
    if (!results.some((result) => result.exercise_id === old.exercise_id)) {
      await ctx.db.query(
        `
        DELETE FROM workout_exercises WHERE workout_id = $1 AND exercise_id = $2
      `,
        [workout.id, old.exercise_id],
      );
    }
  }
}

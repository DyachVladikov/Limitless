import type { GameContext, Input, Row } from '../../core/types';
import { all, insert, one, update } from '../../core/sql';
import { choice, expectVersion, only, uuid } from '../../core/validation';
import { conflict, pageLimit, pageOffset, rowById, sameValues } from '../../core/inputs';
import { workoutData, workoutEdit } from './data';
import { expectSameResults, parseWorkoutResults, replaceWorkoutResults, workoutWithResults } from './results';

export async function listWorkouts(ctx: GameContext, { query }: Input): Promise<Row[]> {
  const kind = query.get('kind');
  if (kind) choice(kind, 'kind', ['gym', 'volleyball']);
  const workouts = await all(
    ctx.db,
    `
    SELECT * FROM workouts
    WHERE ($1::text IS NULL OR kind = $1)
    ORDER BY performed_on DESC, created_at DESC, id DESC
    LIMIT $2 OFFSET $3
  `,
    [kind, pageLimit(query, 3), pageOffset(query)],
  );
  return Promise.all(workouts.map((workout) => workoutWithResults(ctx, workout)));
}

export async function getWorkout(ctx: GameContext, { params }: Input): Promise<Row> {
  const workout = await rowById(ctx, 'workouts', uuid(params.id));
  return workoutWithResults(ctx, workout);
}

export async function createWorkout(ctx: GameContext, { body }: Input): Promise<Row> {
  only(body, ['id', 'kind', 'performedOn', 'attended', 'programId', 'results']);
  const id = uuid(body.id);
  const existing = await one(ctx.db, 'SELECT * FROM workouts WHERE id = $1', [id]);
  choice(body.kind, 'kind', ['gym', 'volleyball']);
  if (existing && body.kind !== existing.kind) {
    conflict('This ID belongs to another kind of workout');
  }
  const data = await workoutData(ctx, body, existing);
  const results = parseWorkoutResults(body.results === undefined ? [] : body.results);

  if (existing) {
    sameValues(existing, data);
    const workout = await workoutWithResults(ctx, existing);
    expectSameResults(workout.results, results);
    return workout;
  }

  const workout = await insert(ctx.db, 'workouts', { id, ...data });
  if (data.kind === 'gym') await replaceWorkoutResults(ctx, workout, results);
  return workoutWithResults(ctx, workout);
}

export async function updateWorkout(ctx: GameContext, { body, params }: Input): Promise<Row> {
  only(body, ['version', 'performedOn', 'attended', 'programId', 'results']);
  const workout = await rowById(ctx, 'workouts', uuid(params.id));
  expectVersion(workout, body.version);
  const data = await workoutData(ctx, workoutEdit(body, workout), workout);
  const results = body.results === undefined ? undefined : parseWorkoutResults(body.results);
  const prior = await all(ctx.db, 'SELECT * FROM workout_exercises WHERE workout_id = $1', [workout.id]);

  const updated = await update(ctx.db, 'workouts', { id: workout.id }, data);
  if (results !== undefined) await replaceWorkoutResults(ctx, updated, results, prior);
  return workoutWithResults(ctx, updated);
}

import type { GameContext, Row } from '../../core/types';
import { one } from '../../core/sql';
import { boolean, choice, uuid } from '../../core/validation';
import { conflict, invalid, performedDate, rowById } from '../../core/inputs';

export async function workoutData(ctx: GameContext, body: Row, existing?: Row): Promise<Row> {
  const kind = choice(body.kind, 'kind', ['gym', 'volleyball']);
  const performedOn = performedDate(ctx, body.performedOn);
  if (kind === 'volleyball') return volleyballData(ctx, body, performedOn, existing);
  return gymData(ctx, body, performedOn, existing);
}

async function volleyballData(
  ctx: GameContext,
  body: Row,
  performedOn: string,
  existing?: Row,
): Promise<Row> {
  if (body.programId !== undefined || body.results !== undefined) {
    invalid('Volleyball has no program or exercise results');
  }
  const attended = boolean(body.attended, 'attended');
  const other = await one(
    ctx.db,
    `
    SELECT id FROM workouts
    WHERE kind = 'volleyball' AND performed_on = $1 AND id <> $2
  `,
    [performedOn, existing?.id ?? body.id],
  );
  if (other) conflict('A volleyball attendance record already exists on this date');
  return {
    kind: 'volleyball',
    performed_on: performedOn,
    attended,
    program_id: null,
    program_name_snapshot: null,
  };
}

async function gymData(ctx: GameContext, body: Row, performedOn: string, existing?: Row): Promise<Row> {
  if (body.attended !== undefined && body.attended !== true) {
    invalid('Gym workouts always have attended=true');
  }
  const programId = uuid(body.programId, 'programId');
  const program = await rowById(ctx, 'workout_programs', programId);
  const keepsProgram = existing?.program_id === programId;
  if (!program.is_enabled && !keepsProgram) conflict('This program is disabled');
  return {
    kind: 'gym',
    performed_on: performedOn,
    attended: true,
    program_id: programId,
    program_name_snapshot: keepsProgram ? existing.program_name_snapshot : program.name,
  };
}

export function workoutEdit(body: Row, current: Row): Row {
  const data = {
    ...body,
    kind: current.kind,
    performedOn: body.performedOn === undefined ? current.performed_on : body.performedOn,
  };
  if (current.kind === 'gym') {
    return { ...data, programId: body.programId === undefined ? current.program_id : body.programId };
  }
  return { ...data, attended: body.attended === undefined ? current.attended : body.attended };
}

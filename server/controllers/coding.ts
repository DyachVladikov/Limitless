import type { GameContext, Input, Row } from '../core/types';
import { all, one, update } from '../core/sql';
import { choice, expectVersion, only, uuid } from '../core/validation';
import { conflict, counter, rowById } from '../core/inputs';
import { addDays } from '../core/dates';
import { applyEffect } from '../game/effects';

async function currentCoding(ctx: GameContext): Promise<Row | undefined> {
  return one(ctx.db, 'SELECT * FROM coding_tasks WHERE assignment_id IS NOT NULL');
}

export async function listCodingTasks(ctx: GameContext): Promise<Row[]> {
  return all(ctx.db, 'SELECT * FROM coding_tasks ORDER BY title, id');
}

export async function getCurrentCoding(ctx: GameContext): Promise<Row | null> {
  return (await currentCoding(ctx)) ?? null;
}

export async function drawCodingTask(ctx: GameContext, { body }: Input): Promise<Row> {
  only(body, ['assignmentId', 'expectedPreviousAssignmentId', 'version']);
  const assignmentId = uuid(body.assignmentId, 'assignmentId');
  const current = await currentCoding(ctx);
  // Сетевой повтор возвращает ту же выдачу, даже если её версия уже изменилась.
  if (current?.assignment_id === assignmentId) {
    return current;
  }

  const previousId =
    body.expectedPreviousAssignmentId === null
      ? null
      : uuid(body.expectedPreviousAssignmentId, 'expectedPreviousAssignmentId');
  if (previousId !== (current?.assignment_id ?? null)) {
    conflict('The current assignment changed; reload before drawing again');
  }
  if (current) {
    expectVersion(current, body.version);
    if (!current.result) {
      conflict('Answer the current coding task before drawing the next one');
    }
  }

  const selected = await one(
    ctx.db,
    `
    SELECT * FROM coding_tasks
    WHERE is_enabled AND (next_available_on IS NULL OR next_available_on <= $1)
    ORDER BY random() LIMIT 1
  `,
    [ctx.today],
  );
  if (!selected) {
    return { available: false, current: current ?? null };
  }

  if (current) {
    await update(
      ctx.db,
      'coding_tasks',
      { id: current.id },
      {
        assignment_id: null,
        assigned_at: null,
        assigned_reward_xp: null,
        result: null,
        resolved_at: null,
        awarded_xp: '0.00',
      },
    );
  }
  return update(
    ctx.db,
    'coding_tasks',
    { id: selected.id },
    {
      assignment_id: assignmentId,
      assigned_at: ctx.now,
      assigned_reward_xp: selected.reward_xp,
      result: null,
      resolved_at: null,
      awarded_xp: '0.00',
      next_available_on: addDays(ctx.today, selected.cooldown_days),
    },
  );
}

export async function setCodingResult(ctx: GameContext, { body, params }: Input): Promise<Row> {
  only(body, ['version', 'assignmentId', 'result']);
  const task = await rowById(ctx, 'coding_tasks', uuid(params.id));
  expectVersion(task, body.version);
  const assignmentId = uuid(body.assignmentId, 'assignmentId');
  if (task.assignment_id !== assignmentId) {
    conflict('This coding assignment is no longer current');
  }
  const result = choice(body.result, 'result', ['solved', 'failed']);
  if (task.result) {
    if (task.result !== result) {
      conflict('A completed coding result cannot be changed');
    }
    return task;
  }

  let awardedXp = 0;
  if (result === 'solved') {
    const reward = await applyEffect(ctx, { xp: task.assigned_reward_xp, stats: {} });
    awardedXp = reward.xp;
    // Прошлая выдача очищается; общий счётчик решений остаётся в профиле.
    await counter(ctx, 'coding_tasks_solved');
  }
  return update(
    ctx.db,
    'coding_tasks',
    { id: task.id },
    {
      result,
      resolved_at: ctx.now,
      awarded_xp: String(awardedXp),
    },
  );
}

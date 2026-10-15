import { inPeriods } from '../core/dates';
import { ApiError } from '../core/errors';
import { all, one, requireRow, update } from '../core/sql';
import type { GameContext, Input, Row } from '../core/types';
import { boolean, expectVersion, only, uuid } from '../core/validation';
import { applyEffect } from '../game/effects';
import { incrementCounter } from '../game/settlement';

export async function getTodayTasks(ctx: GameContext, _input: Input): Promise<Row> {
  const tasks = await all(ctx.db, 'SELECT * FROM tasks WHERE assigned_for = $1 ORDER BY category, id', [
    ctx.today,
  ]);
  return { game_date: ctx.today, absent: inPeriods(ctx.profile.planned_absences, ctx.today), tasks };
}

export async function setTaskCompleted(ctx: GameContext, input: Input): Promise<Row> {
  only(input.body, ['assignmentId', 'version', 'completed']);
  const id = uuid(input.params.id);
  const task = requireRow<Row>(await one<Row>(ctx.db, 'SELECT * FROM tasks WHERE id = $1', [id]));
  const assignmentId = uuid(input.body.assignmentId, 'assignmentId');
  const completed = boolean(input.body.completed, 'completed');
  if (task.assignment_id !== assignmentId || task.assigned_for !== ctx.today) {
    throw new ApiError(409, 'STALE_ASSIGNMENT', 'This daily assignment is no longer current');
  }
  expectVersion(task, input.body.version);
  if (Boolean(task.completed_at) === completed) {
    return task;
  }

  let updated: Row;
  if (completed) {
    const reward = await applyEffect(ctx, task.assigned_effects.reward);
    updated = await update(ctx.db, 'tasks', { id }, { completed_at: ctx.now, applied_reward: reward });
    await incrementCounter(ctx, 'daily_tasks_completed', 1);
    ctx.events.push({ type: 'daily_completed', taskId: id, completionAction: task.completion_action });
  } else {
    await applyEffect(ctx, task.applied_reward, -1);
    updated = await update(ctx.db, 'tasks', { id }, { completed_at: null, applied_reward: null });
    await incrementCounter(ctx, 'daily_tasks_completed', -1);
  }
  return updated;
}

import { BALANCE } from '../config/balance';
import { addDays, inPeriods, moscowDate } from '../core/dates';
import { ApiError } from '../core/errors';
import { all, one } from '../core/sql';
import type { GameContext, Row } from '../core/types';
import { applyEffect, saveProfile } from './effects';
import { settleNutrition } from './nutrition';
import { issueDailies } from './schedule';
import { settleGame } from './settlement';

async function openDay(ctx: GameContext): Promise<void> {
  let goals: Row | null = null;
  if (ctx.profile.nutrition_goal_calories !== null) {
    goals = {};
    for (const key of ['calories', 'protein', 'fat', 'carbs']) {
      goals[key] = Number(ctx.profile[`nutrition_goal_${key}`]);
    }
  }
  await saveProfile(ctx, {
    current_day: ctx.today,
    day_balance_version: BALANCE.version,
    day_nutrition_goals: goals,
    day_activity_snapshot: {
      streak: ctx.profile.activity_streak,
      lastActiveDate: ctx.profile.last_activity_date,
    },
    daily_set_completed_at: null,
  });
  await issueDailies(ctx);
  await settleGame(ctx);
}

async function closeDay(ctx: GameContext): Promise<void> {
  await settleGame(ctx);
  if (!inPeriods(ctx.profile.planned_absences, ctx.today)) {
    const missed = await all(
      ctx.db,
      `
      SELECT assigned_effects FROM tasks
      WHERE assigned_for = $1 AND completed_at IS NULL
    `,
      [ctx.today],
    );
    for (const task of missed) {
      await applyEffect(ctx, task.assigned_effects.penalty, -1);
    }
    await settleNutrition(ctx);
    // Квест, открытый наградой за питание, относится к закрываемому дню.
    await settleGame(ctx);

    const patch: Row = {};
    if (ctx.profile.last_login_date !== ctx.today && ctx.profile.login_streak !== 0) {
      patch.login_streak = 0;
    }
    if (ctx.profile.last_activity_date !== ctx.today && ctx.profile.activity_streak !== 0) {
      patch.activity_streak = 0;
    }
    await saveProfile(ctx, patch);
  }

  await ctx.db.query(
    `
    UPDATE tasks SET assignment_id = NULL, assigned_for = NULL, assigned_effects = NULL,
      completed_at = NULL, applied_reward = NULL
    WHERE assigned_for = $1
  `,
    [ctx.today],
  );
  await ctx.db.query('DELETE FROM nutrition_entries WHERE game_date = $1', [ctx.today]);
  await saveProfile(ctx, {
    last_closed_day: ctx.today,
    current_day: null,
    daily_set_completed_at: null,
  });
}

async function skipAbsentDays(ctx: GameContext, start: string, requestedDay: string): Promise<string> {
  if (start >= requestedDay) {
    return start;
  }
  const period = ctx.profile.planned_absences.find((entry: Row) => {
    return entry.startDate <= start && entry.endDate >= start;
  });
  if (!period) {
    return start;
  }

  let end = period.endDate;
  if (end >= requestedDay) {
    end = addDays(requestedDay, -1);
  }
  // Пустое отсутствие не меняет игру. Перед сохранённым фактом возвращаемся к обычному расчёту.
  const pending = await one(
    ctx.db,
    `
    SELECT min(day) AS first_day FROM (
      SELECT assigned_for AS day FROM tasks WHERE assigned_for BETWEEN $1 AND $2
      UNION ALL SELECT game_date FROM nutrition_entries WHERE game_date BETWEEN $1 AND $2
      UNION ALL SELECT game_date FROM focus_sessions WHERE game_date BETWEEN $1 AND $2
      UNION ALL SELECT completed_on FROM quests WHERE completed_on BETWEEN $1 AND $2
    ) AS facts
  `,
    [start, end],
  );
  if (pending?.first_day) {
    end = addDays(pending.first_day, -1);
  }
  if (end < start) {
    return start;
  }

  await saveProfile(ctx, { last_closed_day: end });
  return addDays(end, 1);
}

export async function prepareDay(ctx: GameContext): Promise<void> {
  const requestedDay = ctx.today;
  let day = ctx.profile.current_day;
  if (!day && ctx.profile.last_closed_day) {
    day = addDays(ctx.profile.last_closed_day, 1);
  }
  if (!day) {
    day = moscowDate(ctx.profile.created_at);
  }
  if (day > requestedDay) {
    throw new ApiError(409, 'CLOCK_MOVED_BACKWARDS', 'Current game day is ahead of the server clock');
  }

  try {
    while (true) {
      ctx.today = day;
      if (!ctx.profile.current_day) {
        await openDay(ctx);
      }
      if (day === requestedDay) {
        break;
      }
      await closeDay(ctx);
      day = await skipAbsentDays(ctx, addDays(day, 1), requestedDay);
    }
  } finally {
    ctx.today = requestedDay;
  }
}

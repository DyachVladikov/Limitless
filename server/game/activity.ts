import { inPeriods } from '../core/dates';
import { one, requireRow } from '../core/sql';
import type { GameContext, Row } from '../core/types';
import { saveProfile } from './effects';

export async function settleActivity(ctx: GameContext): Promise<void> {
  const snapshot = ctx.profile.day_activity_snapshot ?? {
    streak: ctx.profile.activity_streak,
    lastActiveDate: ctx.profile.last_activity_date,
  };
  let streak = Number(snapshot.streak);
  let lastActiveDate = snapshot.lastActiveDate;

  if (!inPeriods(ctx.profile.planned_absences, ctx.today)) {
    const facts = requireRow<Row>(
      await one<Row>(
        ctx.db,
        `
      SELECT
        EXISTS(SELECT 1 FROM tasks WHERE assigned_for = $1 AND completed_at IS NOT NULL)
        OR EXISTS(SELECT 1 FROM quests WHERE completed_on = $1)
        OR EXISTS(SELECT 1 FROM focus_sessions WHERE game_date = $1) AS active
    `,
        [ctx.today],
      ),
    );
    if (facts.active) {
      streak += 1;
      lastActiveDate = ctx.today;
    }
  }

  // Пересчёт от снимка утра позволяет отменить последнюю активность дня.
  if (streak !== ctx.profile.activity_streak || lastActiveDate !== ctx.profile.last_activity_date) {
    await saveProfile(ctx, { activity_streak: streak, last_activity_date: lastActiveDate });
  }
}

import type { GameContext, Row } from '../../core/types';
import { ApiError } from '../../core/errors';
import { all, one, update } from '../../core/sql';
import { inPeriods } from '../../core/dates';
import { applyEffect, reconcileRank, rankIndex, saveProfile } from './effects';

export async function metrics(ctx: GameContext): Promise<Record<string,number>> {
  const row = await one<Row>(ctx.db, `SELECT
    (SELECT count(*) FROM books WHERE completed_at IS NOT NULL) AS books_read,
    (SELECT coalesce(sum(read_units),0) FROM books WHERE progress_unit='pages') AS pages_read,
    (SELECT coalesce(sum(read_units),0) FROM books WHERE progress_unit='chapters') AS chapters_read,
    (SELECT coalesce(sum(duration_seconds),0) FROM focus_sessions) AS focus_seconds,
    (SELECT count(*) FROM workouts WHERE kind='gym' AND attended) AS gym_workouts,
    (SELECT count(*) FROM workouts WHERE kind='volleyball' AND attended) AS volleyball_attendances,
    (SELECT count(*) FROM lab_works WHERE done_at IS NOT NULL) AS lab_works_done,
    (SELECT count(*) FROM lab_works WHERE passed_at IS NOT NULL) AS lab_works_passed,
    (SELECT count(*) FROM subjects WHERE closed_at IS NOT NULL) AS subjects_closed`);
  const result: Record<string,number> = {};
  for (const key of ['daily_tasks_completed','daily_sets_completed','coding_tasks_solved','scenarios_completed']) result[key] = Number(ctx.profile.quest_counters[key] ?? 0);
  for (const [key,value] of Object.entries(row!)) result[key] = Number(value);
  return result;
}
export async function assertCompletedQuests(ctx: GameContext): Promise<void> {
  await settleDailySet(ctx);
  const facts = await metrics(ctx);
  const completed = await all(ctx.db,'SELECT * FROM quests WHERE completed_at IS NOT NULL');
  const invalid = completed.filter(q => (q.progress_mode === 'metric' ? facts[q.metric_key] : q.manual_progress) < q.target_count);
  if (invalid.length) throw new ApiError(409,'COMPLETED_QUEST_DEPENDENCY','This edit would invalidate a completed quest',{ questIds: invalid.map(q => q.id) });
}
export async function incrementCounter(ctx: GameContext, key: string, direction: number): Promise<void> {
  const counters = { ...ctx.profile.quest_counters };
  counters[key] = Math.max(0, Number(counters[key] ?? 0) + direction);
  await saveProfile(ctx,{ quest_counters: counters });
}
async function settleDailySet(ctx: GameContext): Promise<void> {
  const row = await one<Row>(ctx.db,'SELECT count(*) AS total, count(completed_at) AS completed FROM tasks WHERE assigned_for=$1',[ctx.today]);
  const complete = Number(row!.total) === 5 && Number(row!.completed) === 5;
  if (complete === Boolean(ctx.profile.daily_set_completed_at)) return;
  await saveProfile(ctx,{ daily_set_completed_at: complete ? ctx.now : null });
  await incrementCounter(ctx,'daily_sets_completed',complete ? 1 : -1);
}
export async function settleActivity(ctx: GameContext): Promise<void> {
  const snap = ctx.profile.day_activity_snapshot ?? { streak:ctx.profile.activity_streak,lastActiveDate:ctx.profile.last_activity_date };
  let streak = Number(snap.streak), last = snap.lastActiveDate;
  if (!inPeriods(ctx.profile.planned_absences,ctx.today)) {
    const row = await one<Row>(ctx.db,`SELECT EXISTS(SELECT 1 FROM tasks WHERE assigned_for=$1 AND completed_at IS NOT NULL)
      OR EXISTS(SELECT 1 FROM quests WHERE completed_on=$1)
      OR EXISTS(SELECT 1 FROM focus_sessions WHERE game_date=$1) AS active`,[ctx.today]);
    if (row!.active) { streak += 1; last = ctx.today; }
  }
  if (streak !== ctx.profile.activity_streak || last !== ctx.profile.last_activity_date) {
    await saveProfile(ctx,{ activity_streak: streak,last_activity_date: last });
  }
}
export async function settleGame(ctx: GameContext): Promise<void> {
  await settleDailySet(ctx);
  const facts = await metrics(ctx);
  // Every successful loop permanently completes at least one quest. Rewards may unlock the next rank.
  for (;;) {
    await reconcileRank(ctx);
    const unfinished = await all(ctx.db,'SELECT * FROM quests WHERE is_enabled AND completed_at IS NULL ORDER BY required_rank,id');
    let completed = 0;
    for (let quest of unfinished) {
      if (!quest.unlocked_at && rankIndex(quest.required_rank) <= rankIndex(ctx.profile.highest_rank)) {
        quest = await update(ctx.db,'quests',{ id:quest.id },{ unlocked_at:ctx.now });
      }
      if (!quest.unlocked_at) continue;
      const progress = quest.progress_mode === 'metric' ? facts[quest.metric_key] : quest.manual_progress;
      if (progress < quest.target_count) continue;
      const effect = await applyEffect(ctx,{ xp:quest.reward_xp,stats:quest.reward_stats });
      await update(ctx.db,'quests',{ id:quest.id },{ completed_at:ctx.now,completed_on:ctx.today,applied_reward:effect });
      ctx.events.push({ type:'quest_completed',questId:quest.id });
      completed += 1;
    }
    if (!completed) break;
  }
  await settleActivity(ctx);
}

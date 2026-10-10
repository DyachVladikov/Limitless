import { randomUUID } from 'node:crypto';
import type { GameContext, Row } from '../../core/types';
import { ApiError } from '../../core/errors';
import { all, one, update } from '../../core/sql';
import { addDays, inPeriods, moscowDate, weekday } from '../../core/dates';
import { BALANCE } from '../../config/balance';
import { applyEffect, dayBalance, saveProfile } from './effects';
import { settleGame } from './settlement';

async function issueDailies(ctx: GameContext): Promise<void> {
  if (inPeriods(ctx.profile.planned_absences,ctx.today)) return;
  const day = weekday(ctx.today);
  const training = ctx.profile.training_days.includes(day);
  const study = ctx.profile.study_days.includes(day);
  const studyBreak = inPeriods(ctx.profile.study_breaks,ctx.today);
  const eligible = await all(ctx.db,`SELECT t.* FROM tasks t WHERE t.is_enabled AND t.assignment_id IS NULL
    AND (t.next_available_on IS NULL OR t.next_available_on <= $1)
    AND (NOT coalesce((t.availability->>'trainingDayOnly')::boolean,false) OR $2)
    AND (NOT coalesce((t.availability->>'studyDayOnly')::boolean,false) OR $3)
    AND (NOT coalesce((t.availability->>'excludeStudyBreaks')::boolean,false) OR NOT $4)
    AND (t.availability->>'requiredStudyAction' IS NULL
      OR (t.availability->>'requiredStudyAction'='lab_done' AND EXISTS (
        SELECT 1 FROM lab_works l JOIN subjects s ON s.id=l.subject_id WHERE NOT s.is_archived AND s.closed_at IS NULL AND l.done_at IS NULL))
      OR (t.availability->>'requiredStudyAction'='lab_passed' AND EXISTS (
        SELECT 1 FROM lab_works l JOIN subjects s ON s.id=l.subject_id WHERE NOT s.is_archived AND s.closed_at IS NULL AND l.done_at IS NOT NULL AND l.passed_at IS NULL))
      OR (t.availability->>'requiredStudyAction'='subject_closed' AND EXISTS (
        SELECT 1 FROM subjects s WHERE NOT s.is_archived AND s.closed_at IS NULL)))
    ORDER BY random()`,[ctx.today,training,study,studyBreak]);
  const selected: Row[] = [];
  const categories = new Set<string>();
  for (const task of eligible) {
    if (!categories.has(task.category)) { selected.push(task); categories.add(task.category); }
  }
  const selectedIds = new Set(selected.map(t => t.id));
  for (const task of eligible) {
    if (selected.length >= 5) break;
    if (!selectedIds.has(task.id)) { selected.push(task); selectedIds.add(task.id); }
  }
  for (const task of selected.slice(0,5)) {
    await update(ctx.db,'tasks',{ id:task.id },{
      assignment_id: randomUUID(), assigned_for:ctx.today,
      next_available_on:addDays(ctx.today,task.cooldown_days),
      assigned_effects:{ reward:{ xp:Number(task.reward_xp),stats:task.reward_stats },penalty:{ xp:Number(task.penalty_xp),stats:task.penalty_stats } },
    });
  }
}
async function openDay(ctx: GameContext): Promise<void> {
  const goals = ctx.profile.nutrition_goal_calories === null ? null : Object.fromEntries(
    ['calories','protein','fat','carbs'].map(key => [key,Number(ctx.profile[`nutrition_goal_${key}`])]),
  );
  await saveProfile(ctx,{
    current_day:ctx.today, day_balance_version:BALANCE.version, day_nutrition_goals:goals,
    day_activity_snapshot:{ streak:ctx.profile.activity_streak,lastActiveDate:ctx.profile.last_activity_date },
    daily_set_completed_at:null,
  });
  await issueDailies(ctx);
  await settleGame(ctx);
}
async function settleNutrition(ctx: GameContext): Promise<void> {
  if (!ctx.profile.day_nutrition_goals) return;
  const balance = dayBalance(ctx).nutrition;
  const goals = ctx.profile.day_nutrition_goals;
  // PostgreSQL numeric performs the full portion multiplication before comparison or rounding.
  const row = await one<Row>(ctx.db,`WITH totals AS (
    SELECT count(*) AS entries,
      coalesce(sum(calories_per_portion*portions),0) AS calories,
      coalesce(sum(protein_per_portion*portions),0) AS protein,
      coalesce(sum(fat_per_portion*portions),0) AS fat,
      coalesce(sum(carbs_per_portion*portions),0) AS carbs
    FROM nutrition_entries WHERE game_date=$1 AND deleted_at IS NULL
  ) SELECT entries,
    (abs(calories-$2::numeric)*100 <= $2::numeric*$6 AND abs(protein-$3::numeric)*100 <= $3::numeric*$6
      AND abs(fat-$4::numeric)*100 <= $4::numeric*$6 AND abs(carbs-$5::numeric)*100 <= $5::numeric*$6) AS within,
    (abs(calories-$2::numeric)*100 >= $2::numeric*$7 OR abs(protein-$3::numeric)*100 >= $3::numeric*$7
      OR abs(fat-$4::numeric)*100 >= $4::numeric*$7 OR abs(carbs-$5::numeric)*100 >= $5::numeric*$7) AS severe
    FROM totals`,[ctx.today,goals.calories,goals.protein,goals.fat,goals.carbs,balance.tolerancePercent,balance.severeDeviationPercent]);
  if (!Number(row!.entries)) return;
  if (row!.within) await applyEffect(ctx,{ xp:balance.rewardXp,stats:{} });
  else if (row!.severe) await applyEffect(ctx,{ xp:balance.penaltyXp,stats:{} },-1);
}
async function closeDay(ctx: GameContext): Promise<void> {
  await settleGame(ctx);
  if (!inPeriods(ctx.profile.planned_absences,ctx.today)) {
    const missed = await all(ctx.db,'SELECT assigned_effects FROM tasks WHERE assigned_for=$1 AND completed_at IS NULL',[ctx.today]);
    for (const task of missed) await applyEffect(ctx,task.assigned_effects.penalty,-1);
    await settleNutrition(ctx);
    // A nutrition reward can unlock a quest; its completion belongs to this closing day.
    await settleGame(ctx);
    const patch: Row = {};
    if (ctx.profile.last_login_date !== ctx.today && ctx.profile.login_streak !== 0) patch.login_streak = 0;
    if (ctx.profile.last_activity_date !== ctx.today && ctx.profile.activity_streak !== 0) patch.activity_streak = 0;
    await saveProfile(ctx,patch);
  }
  await ctx.db.query(`UPDATE tasks SET assignment_id=NULL,assigned_for=NULL,assigned_effects=NULL,completed_at=NULL,applied_reward=NULL
    WHERE assigned_for=$1`,[ctx.today]);
  await ctx.db.query('DELETE FROM nutrition_entries WHERE game_date=$1',[ctx.today]);
  await saveProfile(ctx,{ last_closed_day:ctx.today,current_day:null,daily_set_completed_at:null });
}
async function skipAbsentDays(ctx: GameContext, start: string, requestedDay: string): Promise<string> {
  if (start >= requestedDay) return start;
  const period = ctx.profile.planned_absences.find((p: Row) => p.startDate <= start && p.endDate >= start);
  if (!period) return start;
  let end = period.endDate < requestedDay ? period.endDate : addDays(requestedDay,-1);
  // The preceding day has already settled every eligible quest. Empty absence days
  // cannot change XP, counters or streaks. Do not skip actual stored day facts.
  const pending = await one<Row>(ctx.db,`SELECT min(day) AS first_day FROM (
    SELECT assigned_for AS day FROM tasks WHERE assigned_for BETWEEN $1 AND $2
    UNION ALL SELECT game_date FROM nutrition_entries WHERE game_date BETWEEN $1 AND $2
    UNION ALL SELECT game_date FROM focus_sessions WHERE game_date BETWEEN $1 AND $2
    UNION ALL SELECT completed_on FROM quests WHERE completed_on BETWEEN $1 AND $2
  ) AS facts`,[start,end]);
  if (pending?.first_day) end = addDays(pending.first_day,-1);
  if (end < start) return start;
  await saveProfile(ctx,{ last_closed_day:end });
  return addDays(end,1);
}
export async function prepareDay(ctx: GameContext): Promise<void> {
  const requestedDay = ctx.today;
  try {
    let day = ctx.profile.current_day ?? (ctx.profile.last_closed_day ? addDays(ctx.profile.last_closed_day,1) : moscowDate(ctx.profile.created_at));
    if (day > requestedDay) throw new ApiError(409,'CLOCK_MOVED_BACKWARDS','Current game day is ahead of the server clock');
    for (;;) {
      ctx.today = day;
      if (!ctx.profile.current_day) await openDay(ctx);
      if (day === requestedDay) break;
      await closeDay(ctx);
      day = await skipAbsentDays(ctx,addDays(day,1),requestedDay);
    }
  } finally { ctx.today = requestedDay; }
}

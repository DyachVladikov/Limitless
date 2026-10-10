import type { GameContext, Row, Route } from '../../core/types';
import { ApiError } from '../../core/errors';
import { all, insert, one, requireRow, update } from '../../core/sql';
import { boolean, expectVersion, integer, only, uuid } from '../../core/validation';
import { cents, amount } from '../../core/money';
import { inPeriods } from '../../core/dates';
import { applyEffect, dayBalance, profileView, saveProfile } from './effects';
import { editProfile } from './profile';
import { incrementCounter, metrics, settleGame } from './settlement';

async function openSession(ctx: GameContext, body: Row): Promise<Row> {
  only(body,[]);
  if (inPeriods(ctx.profile.planned_absences,ctx.today) || ctx.profile.last_login_date === ctx.today) return profileView(ctx.profile);
  const streak = Number(ctx.profile.login_streak) + 1;
  const rewards = dayBalance(ctx).loginRewards;
  await applyEffect(ctx,{ xp:rewards[Math.min(streak,rewards.length)-1],stats:{} });
  await saveProfile(ctx,{ login_streak:streak,last_login_date:ctx.today });
  await settleGame(ctx);
  return profileView(ctx.profile);
}
async function markTask(ctx: GameContext, id: string, body: Row): Promise<Row> {
  only(body,['assignmentId','version','completed']);
  const task = requireRow<Row>(await one<Row>(ctx.db,'SELECT * FROM tasks WHERE id=$1',[uuid(id)]));
  const assignment = uuid(body.assignmentId,'assignmentId');
  const completed = boolean(body.completed,'completed');
  if (task.assignment_id !== assignment || task.assigned_for !== ctx.today) throw new ApiError(409,'STALE_ASSIGNMENT','This daily assignment is no longer current');
  expectVersion(task,body.version);
  if (Boolean(task.completed_at) === completed) return task;
  let result;
  if (completed) {
    const effect = await applyEffect(ctx,task.assigned_effects.reward);
    result = await update(ctx.db,'tasks',{ id },{ completed_at:ctx.now,applied_reward:effect });
    ctx.events.push({ type:'daily_completed',taskId:id,completionAction:task.completion_action });
  } else {
    await applyEffect(ctx,task.applied_reward,-1);
    result = await update(ctx.db,'tasks',{ id },{ completed_at:null,applied_reward:null });
  }
  await incrementCounter(ctx,'daily_tasks_completed',completed ? 1 : -1);
  return result;
}
async function focusSummary(ctx: GameContext): Promise<Row> {
  const summary = await one<Row>(ctx.db,`SELECT coalesce(sum(duration_seconds),0) AS duration_seconds,
    coalesce(sum(credited_seconds),0) AS credited_seconds,coalesce(sum(awarded_xp),0) AS awarded_xp
    FROM focus_sessions WHERE game_date=$1`,[ctx.today]);
  return { ...summary,game_date:ctx.today,daily_limit_seconds:dayBalance(ctx).focusDailySeconds };
}
async function saveFocus(ctx: GameContext, body: Row): Promise<Row> {
  only(body,['id','durationSeconds']);
  const id = uuid(body.id);
  const duration = integer(body.durationSeconds,'durationSeconds',1,2147483647);
  const previous = await one(ctx.db,'SELECT * FROM focus_sessions WHERE id=$1',[id]);
  if (previous) {
    if (previous.duration_seconds !== duration) throw new ApiError(409,'IDEMPOTENCY_CONFLICT','This ID belongs to a different saved duration');
    return previous;
  }
  const balance = dayBalance(ctx);
  const summary = await focusSummary(ctx);
  const used = Number(summary.credited_seconds);
  const credited = Math.max(0,Math.min(duration,balance.focusDailySeconds-used));
  const cumulativeCents = Math.floor((used+credited)*cents(balance.focusXpPerMinute)/60);
  const award = Math.max(0,cumulativeCents-cents(summary.awarded_xp));
  const effect = await applyEffect(ctx,{ xp:amount(award),stats:{} });
  return insert(ctx.db,'focus_sessions',{
    id,game_date:ctx.today,duration_seconds:duration,credited_seconds:credited,
    awarded_xp:amount(cents(effect.xp)),balance_version:balance.version,saved_at:ctx.now,
  });
}
async function questProgress(ctx: GameContext, id: string, body: Row): Promise<Row> {
  only(body,['version','progress']);
  const quest = requireRow<Row>(await one<Row>(ctx.db,'SELECT * FROM quests WHERE id=$1',[uuid(id)]));
  expectVersion(quest,body.version);
  const progress = integer(body.progress,'progress');
  if (quest.progress_mode !== 'manual' || !quest.unlocked_at || !quest.is_enabled) throw new ApiError(409,'QUEST_UNAVAILABLE','Only unlocked manual quests accept progress');
  if (quest.completed_at && progress !== quest.manual_progress) throw new ApiError(409,'QUEST_COMPLETED','Completed quest progress cannot be changed');
  if (progress !== quest.manual_progress) await update(ctx.db,'quests',{ id },{ manual_progress:progress });
  await settleGame(ctx);
  return requireRow<Row>(await one<Row>(ctx.db,'SELECT * FROM quests WHERE id=$1',[id]));
}
async function questSeen(ctx: GameContext, id: string, body: Row): Promise<Row> {
  only(body,['version']);
  const quest = requireRow<Row>(await one<Row>(ctx.db,'SELECT * FROM quests WHERE id=$1',[uuid(id)]));
  expectVersion(quest,body.version);
  if (!quest.completed_at) throw new ApiError(409,'QUEST_INCOMPLETE','Quest is not complete');
  return quest.completion_seen_at ? quest : update(ctx.db,'quests',{ id },{ completion_seen_at:ctx.now });
}
export const gameRoutes: Route[] = [
  { method:'GET',path:'/profile',handle:async ctx => profileView(ctx.profile) },
  { method:'PATCH',path:'/profile',handle:async (ctx,{body}) => editProfile(ctx,body) },
  { method:'POST',path:'/session/open',handle:async (ctx,{body}) => openSession(ctx,body) },
  { method:'GET',path:'/tasks/today',handle:async ctx => ({
    game_date:ctx.today, absent:inPeriods(ctx.profile.planned_absences,ctx.today),
    tasks:await all(ctx.db,'SELECT * FROM tasks WHERE assigned_for=$1 ORDER BY category,id',[ctx.today]),
  }) },
  { method:'PATCH',path:'/tasks/today/:id',handle:async (ctx,{params,body}) => markTask(ctx,params.id,body) },
  { method:'GET',path:'/quests',handle:async ctx => {
    const facts = await metrics(ctx);
    const quests = await all(ctx.db,'SELECT * FROM quests WHERE is_enabled OR completed_at IS NOT NULL ORDER BY completed_at NULLS FIRST,created_at,id');
    return quests.map(q => ({ ...q,progress:q.progress_mode === 'metric' ? facts[q.metric_key] : q.manual_progress }));
  } },
  { method:'PATCH',path:'/quests/:id/progress',handle:async (ctx,{params,body}) => questProgress(ctx,params.id,body) },
  { method:'POST',path:'/quests/:id/seen',handle:async (ctx,{params,body}) => questSeen(ctx,params.id,body) },
  { method:'GET',path:'/focus',handle:async ctx => focusSummary(ctx) },
  { method:'POST',path:'/focus',status:201,handle:async (ctx,{body}) => saveFocus(ctx,body) },
  { method:'POST',path:'/profile/rank-change/seen',handle:async (ctx,{body}) => {
    only(body,['id','version']);
    const id = uuid(body.id);
    expectVersion(ctx.profile,body.version);
    if (ctx.profile.pending_rank_change?.id !== id) throw new ApiError(409,'STALE_NOTIFICATION','Rank notification has changed');
    await saveProfile(ctx,{ pending_rank_change:null });
    return profileView(ctx.profile);
  } },
];

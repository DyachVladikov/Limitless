import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createTestDatabase, context, inTransaction } from './helpers';
import { createProfile } from '../game/profile';
import { prepareDay } from '../game/days';
import { settleGame, assertCompletedQuests, metrics } from '../game/settlement';
import { applyEffect } from '../game/effects';
import { gameHandlers } from './game-handlers';
import type { GameContext, Row } from '../core/types';

async function call(ctx: GameContext, method: string, path: string, body: Row = {}, params: Row = {}) {
  const handler = gameHandlers[`${method} ${path}`];
  assert.ok(handler, `${method} ${path} must exist`);
  return handler(ctx, { body, params, query: new URLSearchParams() }) as Promise<any>;
}
async function setup(now = '2026-10-10T09:00:00.000Z') {
  const db = await createTestDatabase();
  await createProfile(db, { name: 'Owner' }, now);
  return { db, ctx: await context(db, now) };
}
async function task(db: any, category = 'health', extra: Row = {}) {
  const id = randomUUID();
  await db.query(`INSERT INTO tasks(id,title,description,category,cooldown_days,reward_xp,penalty_xp,availability)
    VALUES($1,'Task','',$2,$3,$4,$5,$6)`, [id, category, extra.cooldown ?? 0, extra.reward ?? '20.25', extra.penalty ?? '10.50', extra.availability ?? {}]);
  return id;
}

test('setup creates only a profile and rejects client XP', async () => {
  const db = await createTestDatabase();
  try {
    await assert.rejects(createProfile(db, { name: 'Owner', totalExp: 9999 }, '2026-10-10T09:00:00Z'));
    const p = await createProfile(db, { name: 'Owner' }, '2026-10-10T09:00:00Z');
    assert.equal(Number(p.total_exp), 0);
    assert.equal((await db.query('SELECT count(*) FROM tasks')).rows[0].count, 0);
    await assert.rejects(createProfile(db, { name: 'Second' }, '2026-10-10T09:00:00Z'));
  } finally { await db.close(); }
});

test('daily selection is diverse, freezes rewards, consumes cooldown on issue and is stable', async () => {
  const { db, ctx } = await setup();
  try {
    for (const category of ['study', 'sport', 'health', 'work', 'rationality']) await task(db, category, { cooldown: 3 });
    await task(db, 'study', { availability: { studyDayOnly: true } });
    await prepareDay(ctx);
    const rows = (await db.query('SELECT * FROM tasks WHERE assignment_id IS NOT NULL')).rows;
    assert.equal(rows.length, 5);
    assert.equal(new Set(rows.map(r => r.category)).size, 5);
    assert.ok(rows.every(r => r.next_available_on === '2026-10-13'));
    await prepareDay(ctx);
    assert.deepEqual((await db.query('SELECT assignment_id FROM tasks WHERE assignment_id IS NOT NULL ORDER BY id')).rows,
      rows.sort((a,b) => a.id.localeCompare(b.id)).map(r => ({ assignment_id: r.assignment_id })));
    const row = rows[0];
    await db.query('UPDATE tasks SET reward_xp=999 WHERE id=$1', [row.id]);
    const latest = (await db.query('SELECT * FROM tasks WHERE id=$1', [row.id])).rows[0];
    await call(ctx, 'PATCH', '/tasks/today/:id', { assignmentId: row.assignment_id, version: latest.version, completed: true }, { id: row.id });
    assert.equal(Number(ctx.profile.total_exp), 20.25);
    await assert.rejects(call(ctx, 'PATCH', '/tasks/today/:id', { assignmentId: row.assignment_id, version: latest.version, completed: true }, { id: row.id }));
    assert.equal((await metrics(ctx)).daily_tasks_completed, 1);
  } finally { await db.close(); }
});

test('focus uses cumulative cent floors, idempotency and one shared 7200 second cap', async () => {
  const { db, ctx } = await setup();
  try {
    await prepareDay(ctx);
    const id = randomUUID();
    const a = await call(ctx, 'POST', '/focus', { id, durationSeconds: 1 });
    assert.equal(Number(a.awarded_xp), 0);
    const repeat = await call(ctx, 'POST', '/focus', { id, durationSeconds: 1 });
    assert.equal(repeat.id, id);
    await assert.rejects(call(ctx, 'POST', '/focus', { id, durationSeconds: 2 }));
    await call(ctx, 'POST', '/focus', { id: randomUUID(), durationSeconds: 2 });
    assert.equal(Number(ctx.profile.total_exp), 0.01);
    await call(ctx, 'POST', '/focus', { id: randomUUID(), durationSeconds: 7200 });
    await call(ctx, 'POST', '/focus', { id: randomUUID(), durationSeconds: 60 });
    assert.equal(Number(ctx.profile.total_exp), 24);
    const sum = (await db.query('SELECT sum(credited_seconds) seconds FROM focus_sessions')).rows[0];
    assert.equal(Number(sum.seconds), 7200);
    assert.equal((await metrics(ctx)).focus_seconds, 7263);
    await settleGame(ctx);
    assert.equal(ctx.profile.activity_streak, 1);
  } finally { await db.close(); }
});

test('catchup applies daily penalties once, crosses Moscow midnight and preserves cooldown', async () => {
  const { db, ctx } = await setup('2026-10-10T20:59:59Z');
  try {
    await task(db, 'health', { cooldown: 3 });
    await applyEffect(ctx, { xp: 100, stats: {} });
    await prepareDay(ctx);
    const next = await context(db, '2026-10-10T21:00:00Z');
    await prepareDay(next);
    assert.equal(next.profile.current_day, '2026-10-11');
    assert.equal(next.profile.last_closed_day, '2026-10-10');
    assert.equal(Number(next.profile.total_exp), 89.5);
    await prepareDay(next);
    assert.equal(Number(next.profile.total_exp), 89.5);
    const row = (await db.query('SELECT * FROM tasks')).rows[0];
    assert.equal(row.assignment_id, null);
    assert.equal(row.next_available_on, '2026-10-13');
  } finally { await db.close(); }
});

test('completed metric quests cascade rank unlocks and reject undo that invalidates facts atomically', async () => {
  const { db, ctx } = await setup();
  try {
    const id = await task(db);
    await db.query(`INSERT INTO quests(title,description,required_rank,progress_mode,metric_key,target_count,progress_unit,reward_xp)
      VALUES ('First','','E','metric','daily_tasks_completed',1,'tasks',1000),('Second','','D','metric','daily_tasks_completed',1,'tasks',30)`);
    await prepareDay(ctx);
    const row = (await db.query('SELECT * FROM tasks WHERE id=$1', [id])).rows[0];
    await call(ctx, 'PATCH', '/tasks/today/:id', { assignmentId: row.assignment_id, version: row.version, completed: true }, { id });
    await settleGame(ctx);
    assert.equal((await db.query('SELECT count(*) count FROM quests WHERE completed_at IS NOT NULL')).rows[0].count, 2);
    const xp = ctx.profile.total_exp;
    await settleGame(ctx);
    assert.equal(ctx.profile.total_exp, xp);
    await assert.rejects(inTransaction(db, async () => {
      const undoCtx = await context(db);
      const current = (await db.query('SELECT * FROM tasks WHERE id=$1', [id])).rows[0];
      await call(undoCtx, 'PATCH', '/tasks/today/:id', { assignmentId: current.assignment_id, version: current.version, completed: false }, { id });
      await assertCompletedQuests(undoCtx);
    }), /quest|квест/i);
    assert.ok((await db.query('SELECT completed_at FROM tasks WHERE id=$1', [id])).rows[0].completed_at);
  } finally { await db.close(); }
});

test('absence freezes login and activity streaks while missing ordinary days resets them', async () => {
  const { db, ctx } = await setup();
  try {
    await prepareDay(ctx);
    await call(ctx,'PATCH','/profile',{ version:ctx.profile.version,plannedAbsences:[{startDate:'2026-10-11',endDate:'2026-10-12'}] });
    await call(ctx,'POST','/session/open');
    await call(ctx,'POST','/session/open');
    await call(ctx,'POST','/focus',{ id:randomUUID(),durationSeconds:60 });
    await settleGame(ctx);
    assert.equal(ctx.profile.login_streak,1);
    assert.equal(ctx.profile.activity_streak,1);
    const absent = await context(db,'2026-10-12T09:00:00Z');
    await prepareDay(absent);
    const xp = absent.profile.total_exp;
    await call(absent,'POST','/session/open');
    assert.equal(absent.profile.total_exp,xp);
    assert.equal(absent.profile.login_streak,1);
    assert.equal(absent.profile.activity_streak,1);
    const back = await context(db,'2026-10-13T09:00:00Z');
    await prepareDay(back);
    await call(back,'POST','/session/open');
    await call(back,'POST','/focus',{ id:randomUUID(),durationSeconds:60 });
    await settleGame(back);
    assert.equal(back.profile.login_streak,2);
    assert.equal(back.profile.activity_streak,2);
    const skipped = await context(db,'2026-10-15T09:00:00Z');
    await prepareDay(skipped);
    await call(skipped,'POST','/session/open');
    assert.equal(skipped.profile.login_streak,1);
    assert.equal(skipped.profile.activity_streak,0);
  } finally { await db.close(); }
});

test('nutrition uses frozen goals, decimal portions and never penalizes days without live entries', async () => {
  const db = await createTestDatabase();
  try {
    await createProfile(db,{ name:'Owner',nutritionGoals:{calories:1000,protein:100,fat:50,carbs:200} },'2026-10-10T09:00:00Z');
    const ctx = await context(db);
    await prepareDay(ctx);
    await call(ctx,'PATCH','/profile',{ version:ctx.profile.version,nutritionGoals:{calories:2000,protein:200,fat:100,carbs:400} });
    const dishId=randomUUID();
    await db.query(`INSERT INTO dishes(id,name,calories_per_portion,protein_per_portion,fat_per_portion,carbs_per_portion)
      VALUES($1,'Meal',2000,200,100,400)`,[dishId]);
    await db.query(`INSERT INTO nutrition_entries(id,dish_id,game_date,title,portions,calories_per_portion,protein_per_portion,fat_per_portion,carbs_per_portion)
      VALUES($1,$2,'2026-10-10','Meal',0.5,2000,200,100,400)`,[randomUUID(),dishId]);
    const tomorrow = await context(db,'2026-10-11T09:00:00Z');
    await prepareDay(tomorrow);
    assert.equal(Number(tomorrow.profile.total_exp),10);
    assert.equal(tomorrow.profile.day_nutrition_goals.calories,2000);
    assert.equal((await db.query('SELECT count(*) count FROM nutrition_entries')).rows[0].count,0);
    const empty = await context(db,'2026-10-12T09:00:00Z');
    await prepareDay(empty);
    assert.equal(Number(empty.profile.total_exp),10);
  } finally { await db.close(); }
});

test('undoing the fifth daily cannot invalidate a completed set quest', async () => {
  const { db,ctx } = await setup();
  try {
    for (let i=0;i<5;i++) await task(db);
    await db.query(`INSERT INTO quests(title,description,required_rank,progress_mode,metric_key,target_count,progress_unit,reward_xp)
      VALUES('Set','','E','metric','daily_sets_completed',1,'sets',10)`);
    await prepareDay(ctx);
    for (const row of (await db.query('SELECT * FROM tasks')).rows) {
      await call(ctx,'PATCH','/tasks/today/:id',{assignmentId:row.assignment_id,version:row.version,completed:true},{id:row.id});
      await assertCompletedQuests(ctx);
      await settleGame(ctx);
    }
    assert.equal((await metrics(ctx)).daily_sets_completed,1);
    const row = (await db.query('SELECT * FROM tasks LIMIT 1')).rows[0];
    await assert.rejects(inTransaction(db,async()=>{
      const undo = await context(db);
      await call(undo,'PATCH','/tasks/today/:id',{assignmentId:row.assignment_id,version:row.version,completed:false},{id:row.id});
      await assertCompletedQuests(undo);
    }),/quest|квест/i);
  } finally { await db.close(); }
});

test('rank demotion retains unlocked quests and highest rank, notification roundtrip clears itself', async () => {
  const { db,ctx } = await setup();
  try {
    await prepareDay(ctx);
    await db.query(`INSERT INTO quests(title,description,required_rank,progress_mode,target_count,progress_unit,reward_xp)
      VALUES('Future','','D','manual',10,'steps',10)`);
    await applyEffect(ctx,{xp:500,stats:{strength:2}});
    await settleGame(ctx);
    assert.equal(ctx.profile.highest_rank,'D');
    assert.equal(ctx.profile.pending_rank_change.toRank,'D');
    const oldId = ctx.profile.pending_rank_change.id;
    await applyEffect(ctx,{xp:500,stats:{strength:5}},-1);
    await settleGame(ctx);
    assert.equal(ctx.profile.pending_rank_change,null);
    assert.equal(ctx.profile.stat_strength,0);
    assert.equal(ctx.profile.highest_rank,'D');
    assert.ok((await db.query('SELECT unlocked_at FROM quests')).rows[0].unlocked_at);
    await assert.rejects(call(ctx,'POST','/profile/rank-change/seen',{id:oldId,version:ctx.profile.version}));
  } finally { await db.close(); }
});

test('nutrition rank-up completes newly unlocked quests on the closing day, not today', async () => {
  const db=await createTestDatabase();
  try {
    await createProfile(db,{name:'Owner',nutritionGoals:{calories:1000,protein:100,fat:50,carbs:200}},'2026-10-10T09:00:00Z');
    const ctx=await context(db);
    await prepareDay(ctx);
    await applyEffect(ctx,{xp:490,stats:{}});
    await db.query(`INSERT INTO books(title,progress_unit,total_units,read_units,completed_at) VALUES('Read book','pages',1,1,$1)`,[ctx.now]);
    await db.query(`INSERT INTO quests(title,description,required_rank,progress_mode,metric_key,target_count,progress_unit,reward_xp)
      VALUES('Already read','','D','metric','books_read',1,'books',5)`);
    await db.query(`INSERT INTO nutrition_entries(id,game_date,title,calories_per_portion,protein_per_portion,fat_per_portion,carbs_per_portion)
      VALUES($1,'2026-10-10','Meal',1000,100,50,200)`,[randomUUID()]);
    const today=await context(db,'2026-10-12T09:00:00Z');
    await prepareDay(today);
    assert.equal((await db.query('SELECT completed_on FROM quests')).rows[0].completed_on,'2026-10-10');
    assert.equal(today.profile.activity_streak,0);
  } finally { await db.close(); }
});

test('undo of the only daily activity restores the opening streak snapshot', async () => {
  const {db,ctx}=await setup();
  try {
    const id=await task(db);
    await prepareDay(ctx);
    const taskRow=(await db.query('SELECT * FROM tasks WHERE id=$1',[id])).rows[0];
    const done=await call(ctx,'PATCH','/tasks/today/:id',{assignmentId:taskRow.assignment_id,version:taskRow.version,completed:true},{id});
    await settleGame(ctx);
    assert.equal(ctx.profile.activity_streak,1);
    await call(ctx,'PATCH','/tasks/today/:id',{assignmentId:done.assignment_id,version:done.version,completed:false},{id});
    await assertCompletedQuests(ctx);
    await settleGame(ctx);
    assert.equal(ctx.profile.activity_streak,0);
    assert.equal(ctx.profile.last_activity_date,null);
    assert.equal(Number(ctx.profile.total_exp),0);
    assert.equal((await metrics(ctx)).daily_tasks_completed,0);
  } finally { await db.close(); }
});

test('daily selection requires a live unfinished study action and training schedule', async () => {
  const {db,ctx}=await setup();
  try {
    const labDone=await task(db,'study',{availability:{requiredStudyAction:'lab_done'}});
    const labPassed=await task(db,'study',{availability:{requiredStudyAction:'lab_passed'}});
    const closed=await task(db,'study',{availability:{requiredStudyAction:'subject_closed'}});
    const sport=await task(db,'sport',{availability:{trainingDayOnly:true}});
    const subjectId=randomUUID();
    await db.query("INSERT INTO subjects(id,name) VALUES($1,'Subject')",[subjectId]);
    await db.query('INSERT INTO lab_works(subject_id,number) VALUES($1,1)',[subjectId]);
    await prepareDay(ctx);
    const ids=(await db.query('SELECT id FROM tasks WHERE assignment_id IS NOT NULL')).rows.map(r=>r.id);
    assert.ok(ids.includes(labDone)); assert.ok(ids.includes(closed));
    assert.ok(!ids.includes(labPassed)); assert.ok(!ids.includes(sport));
    assert.equal(ids.length,2);
  } finally { await db.close(); }
});

test('settings reject stale versions, invalid weekdays, retroactive absences and arbitrary XP', async () => {
  const {db,ctx}=await setup();
  try {
    await prepareDay(ctx);
    const version=ctx.profile.version;
    await assert.rejects(call(ctx,'PATCH','/profile',{version,totalExp:1000}));
    await assert.rejects(call(ctx,'PATCH','/profile',{version,trainingDays:[1,1]}));
    await assert.rejects(call(ctx,'PATCH','/profile',{version,plannedAbsences:[{startDate:'2026-10-10',endDate:'2026-10-12'}]}));
    await assert.rejects(call(ctx,'PATCH','/profile',{version,nutritionGoals:{calories:1000,protein:100,fat:50}}));
    await call(ctx,'PATCH','/profile',{version,plannedAbsences:[{startDate:'2026-10-12',endDate:'2026-10-15'},{startDate:'2026-10-11',endDate:'2026-10-13'}]});
    assert.deepEqual(ctx.profile.planned_absences,[{startDate:'2026-10-11',endDate:'2026-10-15'}]);
    await assert.rejects(call(ctx,'PATCH','/profile',{version,name:'Stale change'}));
    assert.equal(ctx.profile.name,'Owner');
    assert.equal(Number(ctx.profile.total_exp),0);
    const later=await context(db,'2026-10-16T09:00:00Z');
    await prepareDay(later);
    await assert.rejects(call(later,'PATCH','/profile',{version:later.profile.version,plannedAbsences:[]}));
  } finally { await db.close(); }
});

test('manual quest completion returns the final version, awards once, and seen has no reward', async () => {
  const {db,ctx}=await setup();
  try {
    await db.query(`INSERT INTO quests(title,description,required_rank,progress_mode,target_count,progress_unit,reward_xp)
      VALUES('Manual','','E','manual',2,'steps',10)`);
    await prepareDay(ctx);
    const row=(await db.query('SELECT * FROM quests')).rows[0];
    const done=await call(ctx,'PATCH','/quests/:id/progress',{version:row.version,progress:2},{id:row.id});
    assert.ok(done.completed_at);
    assert.equal(Number(ctx.profile.total_exp),10);
    await assert.rejects(call(ctx,'PATCH','/quests/:id/progress',{version:row.version,progress:2},{id:row.id}));
    const seen=await call(ctx,'POST','/quests/:id/seen',{version:done.version},{id:row.id});
    assert.ok(seen.completion_seen_at);
    assert.equal(Number(ctx.profile.total_exp),10);
    await assert.rejects(call(ctx,'PATCH','/quests/:id/progress',{version:seen.version,progress:0},{id:row.id}));
  } finally { await db.close(); }
});

test('nutrition with a live zero-calorie entry is evaluated but deleted entries are not', async () => {
  const db=await createTestDatabase();
  try {
    await createProfile(db,{name:'Owner',nutritionGoals:{calories:1000,protein:100,fat:50,carbs:200}},'2026-10-10T09:00:00Z');
    const ctx=await context(db);
    await prepareDay(ctx);
    await applyEffect(ctx,{xp:20,stats:{}});
    await db.query(`INSERT INTO nutrition_entries(id,game_date,title,calories_per_portion,protein_per_portion,fat_per_portion,carbs_per_portion)
      VALUES($1,'2026-10-10','Zero entry',0,0,0,0)`,[randomUUID()]);
    const next=await context(db,'2026-10-11T09:00:00Z');
    await prepareDay(next);
    assert.equal(Number(next.profile.total_exp),15);
    await db.query(`INSERT INTO nutrition_entries(id,game_date,title,deleted_at,calories_per_portion,protein_per_portion,fat_per_portion,carbs_per_portion)
      VALUES($1,'2026-10-11','Deleted entry',$2,0,0,0,0)`,[randomUUID(),next.now]);
    const after=await context(db,'2026-10-12T09:00:00Z');
    await prepareDay(after);
    assert.equal(Number(after.profile.total_exp),15);
    assert.equal((await db.query('SELECT count(*) count FROM nutrition_entries')).rows[0].count,0);
  } finally { await db.close(); }
});

test('login response includes quest rewards unlocked by the login XP', async () => {
  const {db,ctx}=await setup();
  try {
    await prepareDay(ctx);
    await applyEffect(ctx,{xp:499,stats:{}});
    await db.query(`INSERT INTO books(title,progress_unit,total_units,read_units,completed_at) VALUES('Read','pages',1,1,$1)`,[ctx.now]);
    await db.query(`INSERT INTO quests(title,description,required_rank,progress_mode,metric_key,target_count,progress_unit,reward_xp)
      VALUES('Read','','D','metric','books_read',1,'books',1500)`);
    const response=await call(ctx,'POST','/session/open');
    assert.equal(Number(response.total_exp),2000);
    assert.equal(response.rank,'C');
    assert.equal(response.version,ctx.profile.version);
  } finally { await db.close(); }
});

test('long absence catchup stays bounded, preserves streaks and resumes only on its boundary', async () => {
  const base=await createTestDatabase();
  let queries=0;
  const db={query:async <T=Row>(sql:string,values:unknown[]=[])=>{queries++;return base.query<T>(sql,values);}};
  try {
    await createProfile(db,{name:'Owner',plannedAbsences:[{startDate:'2026-10-11',endDate:'2027-10-09'}]},'2026-10-10T09:00:00Z');
    const ctx=await context(db);
    await task(db,'health',{penalty:10});
    await prepareDay(ctx);
    await call(ctx,'POST','/session/open');
    await call(ctx,'POST','/focus',{id:randomUUID(),durationSeconds:60});
    await applyEffect(ctx,{xp:100,stats:{}});
    await settleGame(ctx);
    const later=await context(db,'2027-10-10T09:00:00Z');
    queries=0;
    await prepareDay(later);
    assert.ok(queries<100,`An inert vacation must not cause thousands of remote statements (${queries})`);
    assert.equal(later.profile.last_closed_day,'2027-10-09');
    assert.equal(later.profile.current_day,'2027-10-10');
    assert.equal(Number(later.profile.total_exp),91.2);
    assert.equal(later.profile.login_streak,1);
    assert.equal(later.profile.activity_streak,1);
    assert.equal(later.profile.last_activity_date,'2026-10-10');
    assert.equal((await db.query('SELECT assigned_for FROM tasks')).rows[0].assigned_for,'2027-10-10');
    await call(later,'POST','/session/open');
    await call(later,'POST','/focus',{id:randomUUID(),durationSeconds:60});
    await settleGame(later);
    assert.equal(later.profile.login_streak,2);
    assert.equal(later.profile.activity_streak,2);
  } finally { await base.close(); }
});

test('effect arithmetic keeps cents exact at the database XP limit and rejects overflow before saving', async () => {
  const { db, ctx } = await setup();
  try {
    await applyEffect(ctx, { xp: '999999999999.97', stats: { strength: 2 } });
    const reward = await applyEffect(ctx, { xp: '0.02', stats: {} });
    assert.equal(reward.xp, 0.02);
    assert.equal(ctx.profile.total_exp, '999999999999.99');
    const version = ctx.profile.version;
    await assert.rejects(applyEffect(ctx, { xp: '0.01', stats: { strength: 1 } }), /XP limit/);
    assert.equal(ctx.profile.version, version);
    assert.equal(ctx.profile.stat_strength, 2);

    const reversed = await applyEffect(ctx, { xp: '999999999999.99', stats: { strength: 5 } }, -1);
    assert.deepEqual(reversed, { xp: 999999999999.99, stats: { strength: 2 } });
    assert.equal(Number(ctx.profile.total_exp), 0);
    assert.equal(ctx.profile.stat_strength, 0);
  } finally { await db.close(); }
});

test('absence catchup stops at stored day facts and clears nutrition without applying a penalty', async () => {
  const db = await createTestDatabase();
  try {
    await createProfile(db, {
      name: 'Owner',
      plannedAbsences: [{ startDate: '2026-10-11', endDate: '2027-10-09' }],
      nutritionGoals: { calories: 1000, protein: 100, fat: 50, carbs: 200 },
    }, '2026-10-10T09:00:00Z');
    const ctx = await context(db);
    await prepareDay(ctx);
    await applyEffect(ctx, { xp: '20.25', stats: {} });
    await db.query(`
      INSERT INTO nutrition_entries(id, game_date, title, calories_per_portion,
        protein_per_portion, fat_per_portion, carbs_per_portion)
      VALUES($1, '2027-02-01', 'Vacation meal', 0, 0, 0, 0)
    `, [randomUUID()]);

    const returned = await context(db, '2027-10-10T09:00:00Z');
    await prepareDay(returned);
    assert.equal(returned.profile.current_day, '2027-10-10');
    assert.equal(returned.profile.last_closed_day, '2027-10-09');
    assert.equal(Number(returned.profile.total_exp), 20.25);
    assert.equal((await db.query('SELECT count(*) AS count FROM nutrition_entries')).rows[0].count, 0);
  } finally { await db.close(); }
});

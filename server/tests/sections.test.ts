import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { testRoutes as sectionRoutes } from './routes';
import { mentorReactions } from '../controllers/mentors/reactions';
import { createTestDatabase, context } from './helpers';
import type { GameContext, Row } from '../core/types';

async function fixture() {
  const db = await createTestDatabase();
  await db.query("INSERT INTO profiles(id,name,current_day,day_balance_version) VALUES(1,'Test','2026-10-10','2026-10-10-v1')");
  return db;
}
async function call(ctx: GameContext, method: string, path: string, body: Row = {}, params: Record<string,string> = {}, query = ''): Promise<Row> {
  const route = sectionRoutes.find(r => r.method === method && r.path === path);
  assert.ok(route, `Missing ${method} ${path}`);
  return await route.handle(ctx, { body, params, query: new URLSearchParams(query) }) as Row;
}

test('domain routes support the complete agreed sections without seeded content', async () => {
  for (const [method,path] of [['GET','/gym/programs'],['GET','/gym/exercises'],['POST','/workouts'],['GET','/dishes'],['POST','/nutrition/entries'],['POST','/subjects'],['PATCH','/labs/:id/done'],['GET','/coding/current'],['POST','/coding/next'],['GET','/knowledge'],['POST','/books'],['GET','/scenarios/current'],['POST','/scenarios/next'],['GET','/mentors']]) {
    assert.ok(sectionRoutes.some(r => r.method === method && r.path === path), `Missing ${method} ${path}`);
  }
});

test('nutrition preserves snapshots, exact fractional portions, tombstones and stable IDs', async () => {
  const db = await fixture();
  try {
    const ctx = await context(db, '2026-10-10T09:00:00Z');
    const dish = randomUUID(), id = randomUUID();
    await db.query('INSERT INTO dishes(id,name,calories_per_portion,protein_per_portion,fat_per_portion,carbs_per_portion) VALUES($1,$2,123.45,2.01,3.02,4.03)',[dish,'Soup']);
    const input = {id,gameDate:ctx.today,dishId:dish,portions:'0.125'};
    const entry = await call(ctx,'POST','/nutrition/entries',input);
    await db.query('UPDATE dishes SET calories_per_portion=999 WHERE id=$1',[dish]);
    assert.equal((await call(ctx,'POST','/nutrition/entries',input)).id,id);
    await assert.rejects(call(ctx,'POST','/nutrition/entries',{...input,portions:'2'}),{status:409});
    const today = await call(ctx,'GET','/nutrition/today');
    assert.equal(Number(today.totals.calories),15.43125);
    assert.equal(Number(today.entries[0].calories_per_portion),123.45);
    await call(ctx,'DELETE','/nutrition/entries/:id',{version:entry.version,gameDate:ctx.today},{id});
    assert.ok((await call(ctx,'POST','/nutrition/entries',input)).deleted_at);
    assert.equal((await call(ctx,'GET','/nutrition/today')).entries.length,0);
    await assert.rejects(call(ctx,'POST','/nutrition/entries',{...input,gameDate:'2026-10-09'}),{status:409});
  } finally { await db.close(); }
});

test('study requires done before passed, records reversible rewards and closes subjects only manually', async () => {
  const db = await fixture();
  try {
    const ctx = await context(db,'2026-10-10T09:00:00Z');
    const subject = await call(ctx,'POST','/subjects',{id:randomUUID(),name:'Algorithms',labCount:1});
    const lab = subject.labs[0];
    await assert.rejects(call(ctx,'PATCH','/labs/:id/passed',{version:lab.version,passed:true},{id:lab.id}),{status:409});
    const done = await call(ctx,'PATCH','/labs/:id/done',{version:lab.version,done:true},{id:lab.id});
    const passed = await call(ctx,'PATCH','/labs/:id/passed',{version:done.version,passed:true},{id:lab.id});
    assert.equal(Number(ctx.profile.total_exp),50);
    assert.equal((await db.query('SELECT closed_at FROM subjects')).rows[0].closed_at,null);
    await assert.rejects(call(ctx,'PATCH','/labs/:id/done',{version:passed.version,done:false},{id:lab.id}),{status:409});
    const unpassed = await call(ctx,'PATCH','/labs/:id/passed',{version:passed.version,passed:false},{id:lab.id});
    await call(ctx,'PATCH','/labs/:id/done',{version:unpassed.version,done:false},{id:lab.id});
    assert.equal(Number(ctx.profile.total_exp),0);
  } finally { await db.close(); }
});

test('scenario hides references until submit, snapshots rewards and clears previous attempts', async () => {
  const db = await fixture();
  try {
    const ctx = await context(db,'2026-10-10T09:00:00Z');
    const scenario = randomUUID(), attempt = randomUUID();
    await db.query("INSERT INTO scenarios(id,title,prompt,reference_answer,reward_xp,cooldown_days) VALUES($1,'Case','What?','SECRET',12.35,1)",[scenario]);
    const issued = await call(ctx,'POST','/scenarios/next',{attemptId:attempt,expectedPreviousAttemptId:null});
    assert.equal(JSON.stringify(issued).includes('SECRET'),false);
    await db.query("UPDATE scenarios SET reference_answer='CHANGED',reward_xp=999 WHERE id=$1",[scenario]);
    const current = await call(ctx,'GET','/scenarios/current');
    assert.equal(JSON.stringify(current).includes('SECRET'),false);
    assert.equal(JSON.stringify(current).includes('CHANGED'),false);
    const submitted = await call(ctx,'PATCH','/scenarios/:id/answer',{attemptId:attempt,version:current.version,userAnswer:'My answer',submit:true},{id:scenario});
    assert.equal(submitted.assigned_content.referenceAnswer,'SECRET');
    const completed = await call(ctx,'PATCH','/scenarios/:id/score',{attemptId:attempt,version:submitted.version,selfScore:25},{id:scenario});
    assert.equal(Number(completed.awarded_xp),3.08);
    assert.equal(Number(ctx.profile.total_exp),3.08);
    await assert.rejects(call(ctx,'PATCH','/scenarios/:id/score',{attemptId:attempt,version:submitted.version,selfScore:100},{id:scenario}),{status:409});
    const second = randomUUID();
    await db.query("INSERT INTO scenarios(id,title,prompt,reference_answer,reward_xp,cooldown_days) VALUES($1,'Next','New?','SECRET2',10,0)",[second]);
    await call(ctx,'POST','/scenarios/next',{attemptId:randomUUID(),expectedPreviousAttemptId:attempt,version:completed.version});
    const cleared = (await db.query('SELECT * FROM scenarios WHERE id=$1',[scenario])).rows[0];
    assert.equal(cleared.user_answer,null);
    assert.equal(cleared.attempt_id,null);
  } finally { await db.close(); }
});

test('coding freezes assignment reward, rejects replacing pending attempts and prevents duplicate rewards', async () => {
  const db = await fixture();
  try {
    const ctx = await context(db,'2026-10-10T09:00:00Z');
    const id = randomUUID(), assignmentId = randomUUID();
    await db.query("INSERT INTO coding_tasks(id,title,url,difficulty,reward_xp,cooldown_days) VALUES($1,'Two Sum','https://leetcode.com/problems/two-sum/','easy',25,2)",[id]);
    const assigned = await call(ctx,'POST','/coding/next',{assignmentId,expectedPreviousAssignmentId:null});
    assert.equal(assigned.next_available_on,'2026-10-12');
    await assert.rejects(call(ctx,'POST','/coding/next',{assignmentId:randomUUID(),expectedPreviousAssignmentId:assignmentId,version:assigned.version}),{status:409});
    await db.query('UPDATE coding_tasks SET reward_xp=999 WHERE id=$1',[id]);
    const current = await call(ctx,'GET','/coding/current');
    const done = await call(ctx,'PATCH','/coding/:id/result',{assignmentId,version:current.version,result:'solved'},{id});
    assert.equal(Number(done.awarded_xp),25);
    await assert.rejects(call(ctx,'PATCH','/coding/:id/result',{assignmentId,version:current.version,result:'solved'},{id}),{status:409});
    assert.equal(Number(ctx.profile.total_exp),25);
  } finally { await db.close(); }
});

test('books use absolute versioned progress and archive keeps facts without awarding XP', async () => {
  const db = await fixture();
  try {
    const ctx = await context(db,'2026-10-10T09:00:00Z');
    const id = randomUUID();
    const book = await call(ctx,'POST','/books',{id,title:'Book',progressUnit:'pages',totalUnits:100});
    const read = await call(ctx,'PATCH','/books/:id',{version:book.version,readUnits:100},{id});
    assert.ok(read.completed_at);
    assert.equal(Number(ctx.profile.total_exp),0);
    await assert.rejects(call(ctx,'PATCH','/books/:id',{version:book.version,readUnits:100},{id}),{status:409});
    await assert.rejects(call(ctx,'PATCH','/books/:id',{version:read.version,progressUnit:'chapters'},{id}),{status:409});
    const archived = await call(ctx,'PATCH','/books/:id',{version:read.version,isArchived:true},{id});
    assert.equal(archived.read_units,100);
    assert.ok(archived.completed_at);
  } finally { await db.close(); }
});

test('gym results retain history after program composition edits and return last three', async () => {
  const db = await fixture();
  try {
    const ctx = await context(db,'2026-10-10T09:00:00Z');
    const program = await call(ctx,'POST','/gym/programs',{id:randomUUID(),name:'Upper'});
    const exercise = await call(ctx,'POST','/gym/exercises',{id:randomUUID(),name:'Press',muscleGroup:'chest'});
    await call(ctx,'PUT','/gym/programs/:id/exercises',{version:program.version,exerciseIds:[exercise.id]},{id:program.id});
    for (let i=1;i<=4;i++) await call(ctx,'POST','/workouts',{id:randomUUID(),kind:'gym',performedOn:`2026-10-0${i}`,programId:program.id,results:[{exerciseId:exercise.id,weightKg:String(i*10),repetitions:8}]});
    const p = (await db.query('SELECT * FROM workout_programs WHERE id=$1',[program.id])).rows[0];
    await call(ctx,'PUT','/gym/programs/:id/exercises',{version:p.version,exerciseIds:[]},{id:program.id});
    const history = await call(ctx,'GET','/gym/exercises/:id/history',{}, {id:exercise.id});
    assert.equal(history.length,3);
    assert.deepEqual(history.map((r:Row)=>Number(r.weight_kg)),[40,30,20]);
    assert.equal((await db.query('SELECT * FROM workout_exercises')).rows.length,4);
    assert.equal(Number(ctx.profile.total_exp),0);
  } finally { await db.close(); }
});


test('mentor quest and rank messages bypass chance; daily popup obeys chance and actual-show cooldown', async () => {
  const db = await fixture();
  try {
    const ctx=await context(db,'2026-10-10T09:00:00Z');
    const quest=randomUUID(),task=randomUUID();
    await db.query("INSERT INTO mentors(id,name,section,images,phrases) VALUES('gojo','Gojo','home',$1,$2)",[JSON.stringify({default:'/gojo.png'}),JSON.stringify([{id:'q',event:'quest_completed',mood:'positive',text:'Quest done'},{id:'r',event:'rank_up',mood:'positive',text:'Rank up'}])]);
    await db.query("INSERT INTO mentors(id,name,section,images,phrases) VALUES('coach','Coach','sport',$1,$2)",[JSON.stringify({default:'/coach.png'}),JSON.stringify([{id:'d',event:'daily_completed',mood:'positive',text:'Daily done'},{id:'w',event:'workout_results_reminder',mood:'neutral',text:'Log weights'}])]);
    await db.query("INSERT INTO quests(id,title,description,required_rank,progress_mode,target_count,progress_unit,reward_xp) VALUES($1,'Quest','','E','manual',1,'times',10)",[quest]);
    await db.query("INSERT INTO tasks(id,title,description,category,completion_action,cooldown_days,reward_xp,penalty_xp) VALUES($1,'Gym','','sport','log_gym_results',0,10,0)",[task]);
    ctx.events=[{type:'quest_completed',questId:quest},{type:'rank_up',fromRank:'E',toRank:'D'}];
    await mentorReactions(ctx,()=>0.99);
    assert.equal((ctx.events[0].mentor as Row).text,'Quest done');
    assert.equal((ctx.events[1].mentor as Row).text,'Rank up');
    ctx.events=[{type:'daily_completed',taskId:task}];
    await mentorReactions(ctx,()=>0);
    assert.equal((ctx.events[0].mentor_popup as Row).mentor_id,'coach');
    assert.equal((ctx.events[0].reminder as Row).href,'/do-it');
    assert.equal(ctx.profile.last_mentor_popup_at,null);
    await call(ctx,'POST','/mentors/popup/seen',{version:ctx.profile.version});
    ctx.events=[{type:'daily_completed',taskId:task}];
    await mentorReactions(ctx,()=>0);
    assert.equal(ctx.events[0].mentor_popup,undefined);
    ctx.profile.last_mentor_popup_at=null;
    ctx.events=[{type:'daily_completed',taskId:task}];
    await mentorReactions(ctx,()=>0.99);
    assert.equal(ctx.events[0].mentor_popup,undefined);
  } finally {await db.close();}
});

test('deleting a program disables future visits while existing names and exercise snapshots remain', async () => {
  const db=await fixture();
  try {
    const ctx=await context(db,'2026-10-10T09:00:00Z');
    const program=await call(ctx,'POST','/gym/programs',{id:randomUUID(),name:'Original program'});
    const exercise=await call(ctx,'POST','/gym/exercises',{id:randomUUID(),name:'Original press',muscleGroup:'chest'});
    const composed=await call(ctx,'PUT','/gym/programs/:id/exercises',{version:program.version,exerciseIds:[exercise.id]},{id:program.id});
    const workout=await call(ctx,'POST','/workouts',{id:randomUUID(),kind:'gym',performedOn:ctx.today,programId:program.id,results:[{exerciseId:exercise.id,weightKg:10,repetitions:5}]});
    const renamed=await call(ctx,'PATCH','/gym/programs/:id',{version:composed.version,name:'New program'},{id:program.id});
    await call(ctx,'PATCH','/gym/exercises/:id',{version:exercise.version,name:'New press'},{id:exercise.id});
    const disabled=await call(ctx,'DELETE','/gym/programs/:id',{version:renamed.version},{id:program.id});
    assert.equal(disabled.is_enabled,false);
    const history=await call(ctx,'GET','/workouts/:id',{}, {id:workout.id});
    assert.equal(history.program_name_snapshot,'Original program');
    assert.equal(history.results[0].exercise_name_snapshot,'Original press');
    await assert.rejects(call(ctx,'POST','/workouts',{id:randomUUID(),kind:'gym',performedOn:ctx.today,programId:program.id}),{status:409});
  } finally {await db.close();}
});

test('volleyball enforces one attendance per date, revisions use versions and never grant XP', async () => {
  const db=await fixture();
  try {
    const ctx=await context(db,'2026-10-10T09:00:00Z');
    const input={id:randomUUID(),kind:'volleyball',performedOn:ctx.today,attended:true};
    const created=await call(ctx,'POST','/workouts',input);
    assert.equal((await call(ctx,'POST','/workouts',input)).id,created.id);
    await assert.rejects(call(ctx,'POST','/workouts',{...input,id:randomUUID()}),{status:409});
    await assert.rejects(call(ctx,'POST','/workouts',{...input,id:randomUUID(),performedOn:'2026-10-11'}),{status:400});
    const edited=await call(ctx,'PATCH','/workouts/:id',{version:created.version,attended:false},{id:created.id});
    assert.equal(edited.attended,false);
    await assert.rejects(call(ctx,'PATCH','/workouts/:id',{version:created.version,attended:true},{id:created.id}),{status:409});
    assert.equal(Number(ctx.profile.total_exp),0);
  } finally {await db.close();}
});

test('stable IDs compare text literally and cannot alias numerically similar names', async () => {
  const db=await fixture();
  try {
    const ctx=await context(db,'2026-10-10T09:00:00Z');
    const input={id:randomUUID(),title:'001',progressUnit:'pages',totalUnits:50};
    await call(ctx,'POST','/books',input);
    await assert.rejects(call(ctx,'POST','/books',{...input,title:'1'}),{status:409});
  } finally {await db.close();}
});

test('scenario score at the maximum permitted reward keeps exact cents for every supported percentage', async () => {
  const expectations = [[0,'0.00'],[25,'249999999999.99'],[50,'499999999999.99'],[75,'749999999999.99'],[100,'999999999999.99']] as const;
  const db=await fixture();
  try {
    const id=randomUUID();
    await db.query("INSERT INTO scenarios(id,title,prompt,reference_answer,reward_xp,cooldown_days) VALUES($1,'Boundary','Question','Reference',999999999999.99,0)",[id]);
    let previousAttemptId: string|null=null;
    let previousVersion: string|undefined;
    for(const [selfScore,expected] of expectations) {
      await db.query('UPDATE profiles SET total_exp=0 WHERE id=1');
      const ctx=await context(db,'2026-10-10T09:00:00Z'),attemptId=randomUUID();
      const issued=await call(ctx,'POST','/scenarios/next',{attemptId,expectedPreviousAttemptId:previousAttemptId,...(previousVersion?{version:previousVersion}:{})});
      const submitted=await call(ctx,'PATCH','/scenarios/:id/answer',{version:issued.version,attemptId,userAnswer:'Answer',submit:true},{id});
      const completed=await call(ctx,'PATCH','/scenarios/:id/score',{version:submitted.version,attemptId,selfScore},{id});
      assert.equal(completed.awarded_xp,expected);
      assert.equal(ctx.profile.total_exp,expected);
      previousAttemptId=attemptId;
      previousVersion=completed.version;
    }
  } finally {await db.close();}
});

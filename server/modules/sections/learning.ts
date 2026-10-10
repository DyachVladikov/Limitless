import type { GameContext, Route, Row } from '../../core/types';
import { all, insert, one, update } from '../../core/sql';
import { boolean, choice, expectVersion, integer, only, optionalText, text, uuid } from '../../core/validation';
import { addDays } from '../../core/dates';
import { amount, cents } from '../../core/money';
import { applyEffect } from '../game';
import { conflict, counter, invalid, rowById, sameValues } from './common';

const bookFields = ['title','author','description','sourceUrl','progressUnit','totalUnits','readUnits','isArchived'];
function bookData(body: Row, current?: Row): Row {
  const patch: Row = {};
  if (!current || body.title !== undefined) patch.title=text(body.title,'title');
  for (const [input,column] of [['author','author'],['description','description'],['sourceUrl','source_url']]) {
    if (!current || body[input] !== undefined) patch[column]=optionalText(body[input],input,input==='description'?10000:2000);
  }
  if (!current || body.progressUnit !== undefined) patch.progress_unit=choice(body.progressUnit,'progressUnit',['pages','chapters']);
  if (current && patch.progress_unit && patch.progress_unit !== current.progress_unit && current.read_units > 0) conflict('Reset reading progress explicitly before changing its unit');
  if (!current || body.totalUnits !== undefined) patch.total_units=integer(body.totalUnits,'totalUnits',1);
  if (!current || body.readUnits !== undefined) patch.read_units=integer(body.readUnits ?? 0,'readUnits');
  if (!current || body.isArchived !== undefined) patch.is_archived=boolean(body.isArchived ?? false,'isArchived');
  if ((patch.read_units ?? current?.read_units) > (patch.total_units ?? current?.total_units)) invalid('readUnits cannot exceed totalUnits');
  return patch;
}
function scenarioView(row: Row | undefined): Row | null {
  if (!row) return null;
  // Explicit allowlist: neither pool reference_answer nor an unsubmitted snapshot may leak.
  const content = row.assigned_content;
  return {id:row.id,attempt_id:row.attempt_id,issued_at:row.issued_at,next_available_on:row.next_available_on,version:row.version,
    assigned_content:content ? {title:content.title,prompt:content.prompt,rewardXp:content.rewardXp,...(row.answer_submitted_at?{referenceAnswer:content.referenceAnswer}:{})}:null,
    user_answer:row.user_answer,answer_submitted_at:row.answer_submitted_at,self_score:row.self_score,completed_at:row.completed_at,awarded_xp:row.awarded_xp};
}
async function currentCoding(ctx: GameContext) { return one(ctx.db,'SELECT * FROM coding_tasks WHERE assignment_id IS NOT NULL'); }
async function currentScenario(ctx: GameContext) { return one(ctx.db,'SELECT * FROM scenarios WHERE attempt_id IS NOT NULL'); }
function previous(body: Row,key: string,actual: string | null): void {
  const expected = body[key]===null?null:uuid(body[key],key);
  if (expected !== actual) conflict('The current assignment changed; reload before drawing again');
}
export const learningRoutes: Route[] = [
  {method:'GET',path:'/knowledge',async handle(ctx,{query}) {
    const kind=query.get('kind');
    if(kind) choice(kind,'kind',['law','method','principle','other']);
    return all(ctx.db,'SELECT * FROM knowledge_entries WHERE is_enabled AND ($1::text IS NULL OR kind=$1) ORDER BY sort_order,title,id',[kind]);
  }},
  {method:'GET',path:'/books',async handle(ctx,{query}) {return all(ctx.db,`SELECT * FROM books ${query.get('includeArchived')==='true'?'':'WHERE NOT is_archived'} ORDER BY created_at,id`);}},
  {method:'GET',path:'/books/:id',async handle(ctx,{params}) {return rowById(ctx,'books',uuid(params.id));}},
  {method:'POST',path:'/books',status:201,async handle(ctx,{body}) {
    only(body,['id',...bookFields]);
    const id=uuid(body.id), data=bookData(body);
    const existing=await one(ctx.db,'SELECT * FROM books WHERE id=$1',[id]);
    if(existing) {sameValues(existing,data); return existing;}
    return insert(ctx.db,'books',{id,...data,completed_at:data.read_units===data.total_units?ctx.now:null});
  }},
  {method:'PATCH',path:'/books/:id',async handle(ctx,{body,params}) {
    only(body,['version',...bookFields]);
    const row=await rowById(ctx,'books',uuid(params.id)); expectVersion(row,body.version);
    const data=bookData(body,row);
    const complete=(data.read_units??row.read_units)===(data.total_units??row.total_units);
    data.completed_at=complete?(row.completed_at??ctx.now):null;
    return update(ctx.db,'books',{id:row.id},data);
  }},
  {method:'GET',path:'/coding/tasks',async handle(ctx) {return all(ctx.db,'SELECT * FROM coding_tasks ORDER BY title,id');}},
  {method:'GET',path:'/coding/current',async handle(ctx) {return await currentCoding(ctx)??null;}},
  {method:'POST',path:'/coding/next',async handle(ctx,{body}) {
    only(body,['assignmentId','expectedPreviousAssignmentId','version']);
    const assignmentId=uuid(body.assignmentId,'assignmentId'), current=await currentCoding(ctx);
    if(current?.assignment_id===assignmentId) return current;
    previous(body,'expectedPreviousAssignmentId',current?.assignment_id??null);
    if(current) {expectVersion(current,body.version); if(!current.result) conflict('Answer the current coding task before drawing the next one');}
    const selected=await one(ctx.db,'SELECT * FROM coding_tasks WHERE is_enabled AND (next_available_on IS NULL OR next_available_on<=$1) ORDER BY random() LIMIT 1',[ctx.today]);
    if(!selected) return {available:false,current:current??null};
    if(current) await update(ctx.db,'coding_tasks',{id:current.id},{assignment_id:null,assigned_at:null,assigned_reward_xp:null,result:null,resolved_at:null,awarded_xp:'0.00'});
    return update(ctx.db,'coding_tasks',{id:selected.id},{assignment_id:assignmentId,assigned_at:ctx.now,assigned_reward_xp:selected.reward_xp,result:null,resolved_at:null,awarded_xp:'0.00',next_available_on:addDays(ctx.today,selected.cooldown_days)});
  }},
  {method:'PATCH',path:'/coding/:id/result',async handle(ctx,{body,params}) {
    only(body,['version','assignmentId','result']);
    const row=await rowById(ctx,'coding_tasks',uuid(params.id)); expectVersion(row,body.version);
    if(row.assignment_id!==uuid(body.assignmentId,'assignmentId')) conflict('This coding assignment is no longer current');
    const result=choice(body.result,'result',['solved','failed']);
    if(row.result) {if(row.result!==result) conflict('A completed coding result cannot be changed'); return row;}
    let xp=0;
    if(result==='solved') {xp=(await applyEffect(ctx,{xp:row.assigned_reward_xp,stats:{}})).xp; await counter(ctx,'coding_tasks_solved');}
    return update(ctx.db,'coding_tasks',{id:row.id},{result,resolved_at:ctx.now,awarded_xp:String(xp)});
  }},
  {method:'GET',path:'/scenarios/current',async handle(ctx) {return scenarioView(await currentScenario(ctx));}},
  {method:'POST',path:'/scenarios/next',async handle(ctx,{body}) {
    only(body,['attemptId','expectedPreviousAttemptId','version']);
    const attemptId=uuid(body.attemptId,'attemptId'), current=await currentScenario(ctx);
    if(current?.attempt_id===attemptId) return scenarioView(current);
    previous(body,'expectedPreviousAttemptId',current?.attempt_id??null);
    if(current) {expectVersion(current,body.version); if(!current.completed_at) conflict('Score the current scenario before drawing the next one');}
    const selected=await one(ctx.db,'SELECT * FROM scenarios WHERE is_enabled AND (next_available_on IS NULL OR next_available_on<=$1) ORDER BY random() LIMIT 1',[ctx.today]);
    if(!selected) return {available:false,current:scenarioView(current)};
    if(current) await update(ctx.db,'scenarios',{id:current.id},{attempt_id:null,issued_at:null,assigned_content:null,user_answer:null,answer_submitted_at:null,self_score:null,completed_at:null,awarded_xp:'0.00'});
    const row=await update(ctx.db,'scenarios',{id:selected.id},{attempt_id:attemptId,issued_at:ctx.now,assigned_content:{title:selected.title,prompt:selected.prompt,referenceAnswer:selected.reference_answer,rewardXp:Number(selected.reward_xp)},user_answer:null,answer_submitted_at:null,self_score:null,completed_at:null,awarded_xp:'0.00',next_available_on:addDays(ctx.today,selected.cooldown_days)});
    return scenarioView(row);
  }},
  {method:'PATCH',path:'/scenarios/:id/answer',async handle(ctx,{body,params}) {
    only(body,['version','attemptId','userAnswer','submit']);
    const row=await rowById(ctx,'scenarios',uuid(params.id)); expectVersion(row,body.version);
    if(row.attempt_id!==uuid(body.attemptId,'attemptId')) conflict('This scenario attempt is no longer current');
    if(row.answer_submitted_at) conflict('A submitted answer cannot be changed');
    const submit=boolean(body.submit??false,'submit');
    const answer=submit?text(body.userAnswer,'userAnswer',20000):optionalText(body.userAnswer,'userAnswer',20000);
    return scenarioView(await update(ctx.db,'scenarios',{id:row.id},{user_answer:answer,answer_submitted_at:submit?ctx.now:null}));
  }},
  {method:'PATCH',path:'/scenarios/:id/score',async handle(ctx,{body,params}) {
    only(body,['version','attemptId','selfScore']);
    const row=await rowById(ctx,'scenarios',uuid(params.id)); expectVersion(row,body.version);
    if(row.attempt_id!==uuid(body.attemptId,'attemptId')) conflict('This scenario attempt is no longer current');
    const score=integer(body.selfScore,'selfScore',0,100);
    if(![0,25,50,75,100].includes(score)) invalid('selfScore must be 0, 25, 50, 75 or 100');
    if(!row.answer_submitted_at) conflict('Submit a nonempty answer before scoring');
    if(row.completed_at) {if(row.self_score!==score) conflict('A completed scenario score cannot be changed'); return scenarioView(row);}
    const promised=amount(Math.floor(cents(row.assigned_content.rewardXp)*score/100));
    const effect=await applyEffect(ctx,{xp:promised,stats:{}});
    await counter(ctx,'scenarios_completed');
    return scenarioView(await update(ctx.db,'scenarios',{id:row.id},{self_score:score,completed_at:ctx.now,awarded_xp:String(effect.xp)}));
  }},
];

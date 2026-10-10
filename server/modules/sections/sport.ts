import type { GameContext, Route, Row } from '../../core/types';
import { all, insert, one, update } from '../../core/sql';
import { boolean, choice, expectVersion, integer, object, only, optionalText, text, uuid } from '../../core/validation';
import { conflict, decimal, invalid, pageLimit, pageOffset, performedDate, rowById, sameValues } from './common';

function programData(body: Row, create = false): Row {
  const data: Row = {};
  if(create||body.name!==undefined) data.name=text(body.name,'name');
  if(create||body.description!==undefined) data.description=optionalText(body.description,'description',10000);
  if(create||body.isEnabled!==undefined) data.is_enabled=boolean(body.isEnabled??true,'isEnabled');
  if(create||body.sortOrder!==undefined) data.sort_order=integer(body.sortOrder??0,'sortOrder');
  return data;
}
function exerciseData(body: Row, create = false): Row {
  const data: Row = {};
  if(create||body.name!==undefined) data.name=text(body.name,'name');
  for(const key of ['equipment','note']) if(create||body[key]!==undefined) data[key]=optionalText(body[key],key,2000);
  if(create||body.muscleGroup!==undefined) data.muscle_group=choice(body.muscleGroup,'muscleGroup',['chest','back','legs','shoulders','arms','core','other']);
  if(create||body.isEnabled!==undefined) data.is_enabled=boolean(body.isEnabled??true,'isEnabled');
  return data;
}
async function programView(ctx: GameContext, row: Row): Promise<Row> {
  return {...row,exercises:await all(ctx.db,'SELECT e.*, pe.position, pe.version AS composition_version FROM program_exercises pe JOIN exercises e ON e.id=pe.exercise_id WHERE pe.program_id=$1 ORDER BY pe.position',[row.id])};
}
async function workoutView(ctx: GameContext,row: Row): Promise<Row> {
  return {...row,results:await all(ctx.db,'SELECT * FROM workout_exercises WHERE workout_id=$1 ORDER BY created_at,exercise_id',[row.id])};
}
function parseResults(value: unknown): Row[] {
  if(!Array.isArray(value)||value.length>200) invalid('results must be an array of at most 200 exercise results');
  const ids=new Set<string>();
  return (value as unknown[]).map(value=>{
    const row=object(value); only(row,['exerciseId','weightKg','repetitions']);
    const exercise_id=uuid(row.exerciseId,'exerciseId');
    if(ids.has(exercise_id)) invalid('An exercise can only have one result per workout');
    ids.add(exercise_id);
    return {exercise_id,weight_kg:decimal(row.weightKg,'weightKg',999999.99),repetitions:integer(row.repetitions,'repetitions',1)};
  });
}
async function workoutData(ctx: GameContext,body: Row,current?: Row): Promise<Row> {
  const kind=current?.kind??choice(body.kind,'kind',['gym','volleyball']);
  const performed_on=performedDate(ctx,body.performedOn??current?.performed_on);
  if(kind==='volleyball') {
    if(body.programId!==undefined || body.results!==undefined) invalid('Volleyball has no program or exercise results');
    const attended=boolean(body.attended??current?.attended,'attended');
    const other=await one(ctx.db,"SELECT id FROM workouts WHERE kind='volleyball' AND performed_on=$1 AND id<>$2",[performed_on,current?.id??body.id]);
    if(other) conflict('A volleyball attendance record already exists on this date');
    return {kind,performed_on,attended,program_id:null,program_name_snapshot:null};
  }
  if(body.attended!==undefined && body.attended!==true) invalid('Gym workouts always have attended=true');
  const program_id=uuid(body.programId??current?.program_id,'programId');
  const program=await rowById(ctx,'workout_programs',program_id);
  if(!program.is_enabled && (!current||current.program_id!==program_id)) conflict('This program is disabled');
  return {kind,performed_on,attended:true,program_id,program_name_snapshot:current?.program_id===program_id?current.program_name_snapshot:program.name};
}
async function writeResults(ctx: GameContext,workout: Row,results: Row[],prior: Row[] = []): Promise<void> {
  const composition=await all(ctx.db,'SELECT e.* FROM program_exercises pe JOIN exercises e ON e.id=pe.exercise_id WHERE pe.program_id=$1',[workout.program_id]);
  for(const result of results) {
    const existing=prior.find(r=>r.exercise_id===result.exercise_id), exercise=composition.find(r=>r.id===result.exercise_id);
    if(!existing && (!exercise || !exercise.is_enabled)) conflict('New results must belong to enabled exercises in the selected program');
    const data={...result,exercise_name_snapshot:existing?.exercise_name_snapshot??exercise?.name};
    if(existing) await update(ctx.db,'workout_exercises',{workout_id:workout.id,exercise_id:result.exercise_id},data);
    else await insert(ctx.db,'workout_exercises',{workout_id:workout.id,...data});
  }
  for(const old of prior) if(!results.some(r=>r.exercise_id===old.exercise_id)) await ctx.db.query('DELETE FROM workout_exercises WHERE workout_id=$1 AND exercise_id=$2',[workout.id,old.exercise_id]);
}
export const sportRoutes: Route[] = [
  {method:'GET',path:'/gym/programs',async handle(ctx,{query}) {return all(ctx.db,`SELECT * FROM workout_programs ${query.get('includeDisabled')==='true'?'':'WHERE is_enabled'} ORDER BY sort_order,name,id`);}},
  {method:'GET',path:'/gym/programs/:id',async handle(ctx,{params}) {return programView(ctx,await rowById(ctx,'workout_programs',uuid(params.id)));}},
  {method:'POST',path:'/gym/programs',status:201,async handle(ctx,{body}) {
    only(body,['id','name','description','isEnabled','sortOrder']);
    const id=uuid(body.id),data=programData(body,true),existing=await one(ctx.db,'SELECT * FROM workout_programs WHERE id=$1',[id]);
    if(existing){sameValues(existing,data);return existing;} return insert(ctx.db,'workout_programs',{id,...data});
  }},
  {method:'PATCH',path:'/gym/programs/:id',async handle(ctx,{body,params}) {
    only(body,['version','name','description','isEnabled','sortOrder']);
    const row=await rowById(ctx,'workout_programs',uuid(params.id));expectVersion(row,body.version);
    const patch=programData(body);return Object.keys(patch).length?update(ctx.db,'workout_programs',{id:row.id},patch):row;
  }},
  {method:'PUT',path:'/gym/programs/:id/exercises',async handle(ctx,{body,params}) {
    only(body,['version','exerciseIds']);
    const row=await rowById(ctx,'workout_programs',uuid(params.id));expectVersion(row,body.version);
    if(!Array.isArray(body.exerciseIds)||body.exerciseIds.length>200) invalid('exerciseIds must be an array with at most 200 entries');
    const ids=(body.exerciseIds as unknown[]).map(id=>uuid(id,'exerciseId'));
    if(new Set(ids).size!==ids.length) invalid('Program exercises must not repeat');
    for(const id of ids) if(!(await rowById(ctx,'exercises',id)).is_enabled) conflict('Disabled exercises cannot be added to a program');
    await ctx.db.query('DELETE FROM program_exercises WHERE program_id=$1',[row.id]);
    for(let position=0;position<ids.length;position++) await insert(ctx.db,'program_exercises',{program_id:row.id,exercise_id:ids[position],position});
    return programView(ctx,await update(ctx.db,'workout_programs',{id:row.id},{name:row.name}));
  }},
  {method:'GET',path:'/gym/exercises',async handle(ctx,{query}) {return all(ctx.db,`SELECT * FROM exercises ${query.get('includeDisabled')==='true'?'':'WHERE is_enabled'} ORDER BY name,id`);}},
  {method:'GET',path:'/gym/exercises/:id',async handle(ctx,{params}) {return rowById(ctx,'exercises',uuid(params.id));}},
  {method:'GET',path:'/gym/exercises/:id/history',async handle(ctx,{params,query}) {
    const id=uuid(params.id);await rowById(ctx,'exercises',id);
    return all(ctx.db,'SELECT we.*,w.performed_on,w.program_name_snapshot FROM workout_exercises we JOIN workouts w ON w.id=we.workout_id WHERE we.exercise_id=$1 ORDER BY w.performed_on DESC,w.created_at DESC,w.id DESC LIMIT $2 OFFSET $3',[id,pageLimit(query,3),pageOffset(query)]);
  }},
  {method:'POST',path:'/gym/exercises',status:201,async handle(ctx,{body}) {
    only(body,['id','name','equipment','muscleGroup','note','isEnabled']);
    const id=uuid(body.id),data=exerciseData(body,true),existing=await one(ctx.db,'SELECT * FROM exercises WHERE id=$1',[id]);
    if(existing){sameValues(existing,data);return existing;}return insert(ctx.db,'exercises',{id,...data});
  }},
  {method:'PATCH',path:'/gym/exercises/:id',async handle(ctx,{body,params}) {
    only(body,['version','name','equipment','muscleGroup','note','isEnabled']);
    const row=await rowById(ctx,'exercises',uuid(params.id));expectVersion(row,body.version);
    const patch=exerciseData(body);return Object.keys(patch).length?update(ctx.db,'exercises',{id:row.id},patch):row;
  }},
  {method:'GET',path:'/workouts',async handle(ctx,{query}) {
    const kind=query.get('kind');if(kind)choice(kind,'kind',['gym','volleyball']);
    const rows=await all(ctx.db,'SELECT * FROM workouts WHERE ($1::text IS NULL OR kind=$1) ORDER BY performed_on DESC,created_at DESC,id DESC LIMIT $2 OFFSET $3',[kind,pageLimit(query,3),pageOffset(query)]);
    return Promise.all(rows.map(row=>workoutView(ctx,row)));
  }},
  {method:'GET',path:'/workouts/:id',async handle(ctx,{params}) {return workoutView(ctx,await rowById(ctx,'workouts',uuid(params.id)));}},
  {method:'POST',path:'/workouts',status:201,async handle(ctx,{body}) {
    only(body,['id','kind','performedOn','attended','programId','results']);
    const id=uuid(body.id),existing=await one(ctx.db,'SELECT * FROM workouts WHERE id=$1',[id]);
    const data=await workoutData(ctx,body,existing);
    if(existing) {
      if(body.kind!==existing.kind) conflict('This ID belongs to another kind of workout');
      sameValues(existing,data);
      const view=await workoutView(ctx,existing),results=body.results===undefined?[]:parseResults(body.results);
      if(view.results.length!==results.length) conflict('This workout ID has different results');
      for(const result of results) {const saved=view.results.find((r:Row)=>r.exercise_id===result.exercise_id);if(!saved)conflict('This workout ID has different exercises');sameValues(saved,result);}
      return view;
    }
    const row=await insert(ctx.db,'workouts',{id,...data});
    if(data.kind==='gym')await writeResults(ctx,row,parseResults(body.results??[]));
    return workoutView(ctx,row);
  }},
  {method:'PATCH',path:'/workouts/:id',async handle(ctx,{body,params}) {
    only(body,['version','performedOn','attended','programId','results']);
    const row=await rowById(ctx,'workouts',uuid(params.id));expectVersion(row,body.version);
    const data=await workoutData(ctx,body,row),prior=await all(ctx.db,'SELECT * FROM workout_exercises WHERE workout_id=$1',[row.id]);
    const updated=await update(ctx.db,'workouts',{id:row.id},data);
    if(body.results!==undefined)await writeResults(ctx,updated,parseResults(body.results),prior);
    return workoutView(ctx,updated);
  }},
];

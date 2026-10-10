import type { Route } from '../../core/types';
import { all, insert, one, update } from '../../core/sql';
import { boolean, expectVersion, integer, only, text, uuid } from '../../core/validation';
import { BALANCE } from '../../config/balance';
import { applyEffect } from '../game';
import { conflict, rowById, sameValues, subjectView } from './common';

export const studyRoutes: Route[] = [
  {method:'GET',path:'/subjects',async handle(ctx,{query}) {
    const rows = await all(ctx.db,`SELECT s.*, (SELECT COUNT(*)::integer FROM lab_works l WHERE l.subject_id=s.id) AS lab_count FROM subjects s ${query.get('includeArchived')==='true'?'':'WHERE NOT is_archived'} ORDER BY created_at,id`);
    return rows;
  }},
  {method:'GET',path:'/subjects/:id',async handle(ctx,{params}) { return subjectView(ctx,await rowById(ctx,'subjects',uuid(params.id))); }},
  {method:'POST',path:'/subjects',status:201,async handle(ctx,{body}) {
    only(body,['id','name','labCount']);
    const id = uuid(body.id), name = text(body.name,'name'), labCount = integer(body.labCount,'labCount',0,500);
    const existing = await one(ctx.db,'SELECT * FROM subjects WHERE id=$1',[id]);
    if (existing) {
      sameValues(existing,{name});
      const view = await subjectView(ctx,existing);
      if (view.labs.length !== labCount) conflict('This subject ID has a different number of labs');
      return view;
    }
    const row = await insert(ctx.db,'subjects',{id,name});
    await ctx.db.query('INSERT INTO lab_works(subject_id,number) SELECT $1, n FROM generate_series(1,$2::integer) n',[id,labCount]);
    return subjectView(ctx,row);
  }},
  {method:'PATCH',path:'/subjects/:id',async handle(ctx,{body,params}) {
    only(body,['version','name','isArchived']);
    const row=await rowById(ctx,'subjects',uuid(params.id)); expectVersion(row,body.version);
    const patch: Record<string,unknown> = {};
    if (body.name !== undefined) patch.name=text(body.name,'name');
    if (body.isArchived !== undefined) patch.is_archived=boolean(body.isArchived,'isArchived');
    return Object.keys(patch).length ? update(ctx.db,'subjects',{id:row.id},patch) : row;
  }},
  {method:'PATCH',path:'/subjects/:id/closed',async handle(ctx,{body,params}) {
    only(body,['version','closed']);
    const row=await rowById(ctx,'subjects',uuid(params.id)); expectVersion(row,body.version);
    const closed=boolean(body.closed,'closed');
    if (!!row.closed_at === closed) return row;
    if (closed) {
      const effect=await applyEffect(ctx,BALANCE.study.subjectClosed);
      return update(ctx.db,'subjects',{id:row.id},{closed_at:ctx.now,closed_awarded_xp:String(effect.xp)});
    }
    await applyEffect(ctx,{xp:row.closed_awarded_xp,stats:{}},-1);
    return update(ctx.db,'subjects',{id:row.id},{closed_at:null,closed_awarded_xp:'0.00'});
  }},
  ...(['done','passed'] as const).map((kind): Route => ({method:'PATCH',path:`/labs/:id/${kind}`,async handle(ctx,{body,params}) {
    only(body,['version',kind]);
    const row=await rowById(ctx,'lab_works',uuid(params.id)); expectVersion(row,body.version);
    const checked=boolean(body[kind],kind);
    if (!!row[`${kind}_at`] === checked) return row;
    if (kind==='passed' && checked && !row.done_at) conflict('Mark the lab done before marking it passed');
    if (kind==='done' && !checked && row.passed_at) conflict('Undo passing before undoing completion');
    if (checked) {
      const effect=await applyEffect(ctx,kind==='done'?BALANCE.study.labDone:BALANCE.study.labPassed);
      return update(ctx.db,'lab_works',{id:row.id},{[`${kind}_at`]:ctx.now,[`${kind}_awarded_xp`]:String(effect.xp)});
    }
    await applyEffect(ctx,{xp:row[`${kind}_awarded_xp`],stats:{}},-1);
    return update(ctx.db,'lab_works',{id:row.id},{[`${kind}_at`]:null,[`${kind}_awarded_xp`]:'0.00'});
  }})),
];

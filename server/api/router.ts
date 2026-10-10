import { transaction, type TransactionRunner } from '../core/database';
import { handleAuth, requireJob, requireOwner } from '../core/auth';
import { guardOrigin, preflight, readBody, respond, respondError } from '../core/http';
import { ApiError } from '../core/errors';
import { moscowDate } from '../core/dates';
import { one } from '../core/sql';
import { serialize } from '../core/serialize';
import type { GameContext, Row, Route, Sql } from '../core/types';
import { assertCompletedQuests, createProfile, gameRoutes, prepareDay, profileView, settleGame } from '../modules/game';
import { mentorReactions, sectionRoutes } from '../modules/sections';

export const routes: Route[] = [...gameRoutes, ...sectionRoutes];
function match(pattern: string, path: string): Record<string,string> | null {
  const template = pattern.split('/'), actual = path.split('/');
  if(template.length !== actual.length) return null;
  const params: Record<string,string> = {};
  for(let i=0;i<template.length;i++) {
    if(template[i].startsWith(':')) {
      try { params[template[i].slice(1)] = decodeURIComponent(actual[i]); }
      catch { throw new ApiError(400,'INVALID_PATH','Некорректный параметр URL'); }
    }
    else if(template[i] !== actual[i]) return null;
  }
  return params;
}
async function context(db:Sql, now:string):Promise<GameContext> {
  const profile=await one<Row>(db,'SELECT * FROM profiles WHERE id=1 FOR UPDATE');
  if(!profile) throw new ApiError(404,'PROFILE_NOT_CONFIGURED','Сначала создайте профиль через POST /api/profile');
  return {db,profile,now,today:moscowDate(now),events:[]};
}
async function finish(ctx:GameContext,data:unknown) {
  await mentorReactions(ctx);
  return serialize({data,profile:profileView(ctx.profile),events:ctx.events,meta:{gameDate:ctx.today,profileVersion:String(ctx.profile.version)}});
}
export function createHandler(options: {runTransaction?:TransactionRunner;now?:()=>string} = {}) {
  const run = options.runTransaction ?? transaction;
  return async function handle(request:Request):Promise<Response> {
    try {
      if(request.method==='OPTIONS') return preflight(request);
      guardOrigin(request);
      const url=new URL(request.url);
      const path=url.pathname.startsWith('/api/') ? url.pathname.slice(4).replace(/\/$/,'') : '';
      if(path==='/health' && (request.method==='GET'||request.method==='HEAD')) return respond(request,{status:'ok'});
      const auth=await handleAuth(request,path);
      if(auth) return auth;
      const now=options.now?.() ?? new Date().toISOString();
      if(path==='/jobs/rollover') {
        requireJob(request);
        if(request.method!=='POST') throw new ApiError(405,'METHOD_NOT_ALLOWED','Use POST for this endpoint');
        const data=await run(async db=>{
          const profile=await one<Row>(db,'SELECT * FROM profiles WHERE id=1 FOR UPDATE');
          if(!profile) return {configured:false};
          const ctx:GameContext={db,profile,now,today:moscowDate(now),events:[]};
          await prepareDay(ctx); await settleGame(ctx);
          return {configured:true,gameDate:ctx.today,lastClosedDay:ctx.profile.last_closed_day};
        });
        return respond(request,data);
      }
      await requireOwner(request);
      if(path==='/profile' && request.method==='POST') {
        const body=await readBody(request);
        const result=await run(async db=>{
          await createProfile(db,body,now);
          const ctx=await context(db,now);
          await prepareDay(ctx); await settleGame(ctx);
          return finish(ctx,profileView(ctx.profile));
        });
        return respond(request,result,201);
      }
      const matches=routes.flatMap(route=>{const params=match(route.path,path);return params?[{route,params}]:[];});
      const selected=matches.find(({route})=>route.method===request.method);
      if(!selected) {
        if(!matches.length) throw new ApiError(404,'NOT_FOUND','Маршрут не найден');
        const response=respondError(request,new ApiError(405,'METHOD_NOT_ALLOWED','Метод не поддерживается'));
        response.headers.set('Allow',[...new Set(matches.map(({route})=>route.method)), 'OPTIONS'].join(', '));
        return response;
      }
      const writing=request.method!=='GET';
      const body=writing?await readBody(request):{};
      const result=await run(async db=>{
        const ctx=await context(db,now);
        await prepareDay(ctx); await settleGame(ctx);
        const data=await selected.route.handle(ctx,{body,params:selected.params,query:url.searchParams});
        if(writing) await assertCompletedQuests(ctx);
        await settleGame(ctx);
        return finish(ctx,data);
      });
      return respond(request,result,selected.route.status??200);
    } catch(error) { return respondError(request,error); }
  };
}
export const handleRequest=createHandler();

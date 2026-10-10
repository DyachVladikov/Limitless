import type { Route } from '../../core/types';
import { sportRoutes } from './sport';
import { nutritionRoutes } from './nutrition';
import { studyRoutes } from './study';
import { learningRoutes } from './learning';
import { mentorRoutes } from './mentors';
import { rowById } from './common';
import { update } from '../../core/sql';
import { expectVersion, only, uuid } from '../../core/validation';
export { mentorReactions } from './mentors';
const archiveRoutes: Route[] = [
  ['/gym/programs/:id','workout_programs','is_enabled',false],
  ['/gym/exercises/:id','exercises','is_enabled',false],
  ['/subjects/:id','subjects','is_archived',true],
  ['/books/:id','books','is_archived',true],
].map(([path,table,column,value]) => ({method:'DELETE',path:String(path),async handle(ctx,{body,params}) {
  only(body,['version']);
  const row=await rowById(ctx,String(table),uuid(params.id));expectVersion(row,body.version);
  return update(ctx.db,String(table),{id:row.id},{[String(column)]:value});
}}));
export const sectionRoutes: Route[] = [...sportRoutes,...nutritionRoutes,...studyRoutes,...learningRoutes,...mentorRoutes,...archiveRoutes];

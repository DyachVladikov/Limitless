import type { GameContext, Route, Row } from '../../core/types';
import { all, insert, one, update } from '../../core/sql';
import { expectVersion, only, text, uuid } from '../../core/validation';
import { conflict, currentDate, decimal, invalid, portions, rowById, sameValues } from './common';

const macroKeys = ['calories','protein','fat','carbs'] as const;
const fields = ['gameDate','dishId','title','portions',...macroKeys];
async function dataFor(ctx: GameContext, body: Row, existing?: Row): Promise<Row> {
  const game_date = currentDate(ctx,body.gameDate);
  const dish_id = body.dishId === undefined ? existing?.dish_id ?? null : body.dishId === null ? null : uuid(body.dishId,'dishId');
  const data: Row = {game_date,dish_id};
  if (dish_id) {
    if (body.title !== undefined || macroKeys.some(k=>body[k] !== undefined)) invalid('Dish nutrition comes from its stored snapshot');
    const source = existing && existing.dish_id === dish_id ? existing : await rowById(ctx,'dishes',dish_id);
    if (!existing && source.is_enabled === false) conflict('This dish is disabled');
    if (existing?.dish_id !== dish_id && source.is_enabled === false) conflict('This dish is disabled');
    data.title = source.title ?? source.name;
    data.portions = portions(body.portions ?? existing?.portions ?? 1);
    for (const key of macroKeys) data[`${key}_per_portion`] = decimal(source[`${key}_per_portion`],key);
  } else {
    if (body.portions !== undefined && Number(portions(body.portions)) !== 1) invalid('Manual nutrition always uses one portion');
    data.title = text(body.title ?? existing?.title,'title');
    data.portions = '1.000';
    for (const key of macroKeys) data[`${key}_per_portion`] = decimal(body[key] ?? (existing?.dish_id === null ? existing?.[`${key}_per_portion`] : undefined),key);
  }
  return data;
}
export const nutritionRoutes: Route[] = [
  {method:'GET',path:'/dishes',async handle(ctx) { return all(ctx.db,'SELECT * FROM dishes WHERE is_enabled ORDER BY name,id'); }},
  {method:'GET',path:'/nutrition/today',async handle(ctx) {
    const entries = await all(ctx.db,'SELECT * FROM nutrition_entries WHERE game_date=$1 AND deleted_at IS NULL ORDER BY created_at,id',[ctx.today]);
    const totals = await one(ctx.db,`SELECT COUNT(*)::integer AS count, COALESCE(SUM(calories_per_portion*portions),0)::text AS calories, COALESCE(SUM(protein_per_portion*portions),0)::text AS protein, COALESCE(SUM(fat_per_portion*portions),0)::text AS fat, COALESCE(SUM(carbs_per_portion*portions),0)::text AS carbs FROM nutrition_entries WHERE game_date=$1 AND deleted_at IS NULL`,[ctx.today]);
    return {game_date:ctx.today,goals:ctx.profile.day_nutrition_goals,entries,totals};
  }},
  {method:'POST',path:'/nutrition/entries',status:201,async handle(ctx,{body}) {
    only(body,['id',...fields]);
    const id = uuid(body.id);
    currentDate(ctx,body.gameDate);
    const existing = await one(ctx.db,'SELECT * FROM nutrition_entries WHERE id=$1',[id]);
    const data = await dataFor(ctx,body,existing ?? undefined);
    if (existing) { sameValues(existing,data); return existing; }
    return insert(ctx.db,'nutrition_entries',{id,...data});
  }},
  {method:'PATCH',path:'/nutrition/entries/:id',async handle(ctx,{body,params}) {
    only(body,['version',...fields]);
    currentDate(ctx,body.gameDate);
    const row = await rowById(ctx,'nutrition_entries',uuid(params.id));
    expectVersion(row,body.version);
    if (row.deleted_at) conflict('Deleted nutrition cannot be edited');
    if (row.game_date !== ctx.today) conflict('Nutrition can only be edited during its open day');
    return update(ctx.db,'nutrition_entries',{id:row.id},await dataFor(ctx,body,row));
  }},
  {method:'DELETE',path:'/nutrition/entries/:id',async handle(ctx,{body,params}) {
    only(body,['version','gameDate']);
    currentDate(ctx,body.gameDate);
    const row = await rowById(ctx,'nutrition_entries',uuid(params.id));
    expectVersion(row,body.version);
    if (row.game_date !== ctx.today) conflict('Nutrition can only be deleted during its open day');
    return row.deleted_at ? row : update(ctx.db,'nutrition_entries',{id:row.id},{deleted_at:ctx.now});
  }},
];

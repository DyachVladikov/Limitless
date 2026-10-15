import type { GameContext, Input, Row } from '../../core/types';
import { all, insert, one, update } from '../../core/sql';
import { expectVersion, only, uuid } from '../../core/validation';
import { conflict, currentDate, rowById, sameValues } from '../../core/inputs';
import { nutritionData, nutritionEdit } from './data';

export async function listDishes(ctx: GameContext, _input: Input): Promise<Row[]> {
  return all(ctx.db, 'SELECT * FROM dishes WHERE is_enabled ORDER BY name, id');
}

export async function getTodayNutrition(ctx: GameContext, _input: Input): Promise<Row> {
  const entries = await all(
    ctx.db,
    `
    SELECT * FROM nutrition_entries
    WHERE game_date = $1 AND deleted_at IS NULL
    ORDER BY created_at, id
  `,
    [ctx.today],
  );
  const totals = await one(
    ctx.db,
    `
    SELECT COUNT(*)::integer AS count,
      COALESCE(SUM(calories_per_portion * portions), 0)::text AS calories,
      COALESCE(SUM(protein_per_portion * portions), 0)::text AS protein,
      COALESCE(SUM(fat_per_portion * portions), 0)::text AS fat,
      COALESCE(SUM(carbs_per_portion * portions), 0)::text AS carbs
    FROM nutrition_entries
    WHERE game_date = $1 AND deleted_at IS NULL
  `,
    [ctx.today],
  );
  return { game_date: ctx.today, goals: ctx.profile.day_nutrition_goals, entries, totals };
}

export async function createNutritionEntry(ctx: GameContext, { body }: Input): Promise<Row> {
  only(body, ['id', 'gameDate', 'dishId', 'title', 'portions', 'calories', 'protein', 'fat', 'carbs']);
  const id = uuid(body.id);
  currentDate(ctx, body.gameDate);
  const existing = await one(ctx.db, 'SELECT * FROM nutrition_entries WHERE id = $1', [id]);
  const data = await nutritionData(ctx, body, existing);
  if (existing) {
    sameValues(existing, data);
    return existing;
  }
  return insert(ctx.db, 'nutrition_entries', { id, ...data });
}

export async function updateNutritionEntry(ctx: GameContext, { body, params }: Input): Promise<Row> {
  only(body, ['version', 'gameDate', 'dishId', 'title', 'portions', 'calories', 'protein', 'fat', 'carbs']);
  currentDate(ctx, body.gameDate);
  const entry = await rowById(ctx, 'nutrition_entries', uuid(params.id));
  expectVersion(entry, body.version);
  if (entry.deleted_at) conflict('Deleted nutrition cannot be edited');
  if (entry.game_date !== ctx.today) conflict('Nutrition can only be edited during its open day');
  const data = await nutritionData(ctx, nutritionEdit(body, entry), entry);
  return update(ctx.db, 'nutrition_entries', { id: entry.id }, data);
}

export async function deleteNutritionEntry(ctx: GameContext, { body, params }: Input): Promise<Row> {
  only(body, ['version', 'gameDate']);
  currentDate(ctx, body.gameDate);
  const entry = await rowById(ctx, 'nutrition_entries', uuid(params.id));
  expectVersion(entry, body.version);
  if (entry.game_date !== ctx.today) conflict('Nutrition can only be deleted during its open day');
  if (entry.deleted_at) return entry;
  return update(ctx.db, 'nutrition_entries', { id: entry.id }, { deleted_at: ctx.now });
}

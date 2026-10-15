import type { GameContext, Row } from '../../core/types';
import { text, uuid } from '../../core/validation';
import { conflict, currentDate, decimal, invalid, portions, rowById } from '../../core/inputs';

export async function nutritionData(ctx: GameContext, body: Row, existing?: Row): Promise<Row> {
  const gameDate = currentDate(ctx, body.gameDate);
  const dishId = body.dishId == null ? null : uuid(body.dishId, 'dishId');
  const nutrition = dishId ? await dishNutritionData(ctx, body, dishId, existing) : manualNutritionData(body);
  return { game_date: gameDate, dish_id: dishId, ...nutrition };
}

async function dishNutritionData(ctx: GameContext, body: Row, dishId: string, existing?: Row): Promise<Row> {
  if (
    body.title !== undefined ||
    body.calories !== undefined ||
    body.protein !== undefined ||
    body.fat !== undefined ||
    body.carbs !== undefined
  ) {
    invalid('Dish nutrition comes from its stored snapshot');
  }
  const keepsDish = existing?.dish_id === dishId;
  const source = keepsDish ? existing : await rowById(ctx, 'dishes', dishId);
  if (source.is_enabled === false) conflict('This dish is disabled');
  return {
    title: keepsDish ? source.title : source.name,
    portions: portions(body.portions === undefined ? 1 : body.portions),
    calories_per_portion: decimal(source.calories_per_portion, 'calories'),
    protein_per_portion: decimal(source.protein_per_portion, 'protein'),
    fat_per_portion: decimal(source.fat_per_portion, 'fat'),
    carbs_per_portion: decimal(source.carbs_per_portion, 'carbs'),
  };
}

function manualNutritionData(body: Row): Row {
  if (body.portions !== undefined && Number(portions(body.portions)) !== 1) {
    invalid('Manual nutrition always uses one portion');
  }
  return {
    title: text(body.title, 'title'),
    portions: '1.000',
    calories_per_portion: decimal(body.calories, 'calories'),
    protein_per_portion: decimal(body.protein, 'protein'),
    fat_per_portion: decimal(body.fat, 'fat'),
    carbs_per_portion: decimal(body.carbs, 'carbs'),
  };
}

export function nutritionEdit(body: Row, current: Row): Row {
  const dishId = body.dishId === undefined ? current.dish_id : body.dishId;
  if (dishId !== null) {
    return { ...body, dishId, portions: body.portions === undefined ? current.portions : body.portions };
  }
  const previousManual = current.dish_id === null ? current : undefined;
  return {
    ...body,
    dishId: null,
    title: body.title === undefined ? current.title : body.title,
    calories: body.calories === undefined ? previousManual?.calories_per_portion : body.calories,
    protein: body.protein === undefined ? previousManual?.protein_per_portion : body.protein,
    fat: body.fat === undefined ? previousManual?.fat_per_portion : body.fat,
    carbs: body.carbs === undefined ? previousManual?.carbs_per_portion : body.carbs,
  };
}

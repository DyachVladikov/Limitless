import { one, requireRow } from '../core/sql';
import type { GameContext, Row } from '../core/types';
import { applyEffect, dayBalance } from './effects';

export async function settleNutrition(ctx: GameContext): Promise<void> {
  const goals = ctx.profile.day_nutrition_goals;
  if (!goals) {
    return;
  }

  const balance = dayBalance(ctx).nutrition;
  // numeric умножает дробные порции точно, до сравнения с границами нормы.
  const totals = requireRow<Row>(
    await one<Row>(
      ctx.db,
      `
    WITH totals AS (
      SELECT count(*) AS entries,
        coalesce(sum(calories_per_portion * portions), 0) AS calories,
        coalesce(sum(protein_per_portion * portions), 0) AS protein,
        coalesce(sum(fat_per_portion * portions), 0) AS fat,
        coalesce(sum(carbs_per_portion * portions), 0) AS carbs
      FROM nutrition_entries
      WHERE game_date = $1 AND deleted_at IS NULL
    )
    SELECT entries,
      (
        abs(calories - $2::numeric) * 100 <= $2::numeric * $6
        AND abs(protein - $3::numeric) * 100 <= $3::numeric * $6
        AND abs(fat - $4::numeric) * 100 <= $4::numeric * $6
        AND abs(carbs - $5::numeric) * 100 <= $5::numeric * $6
      ) AS within,
      (
        abs(calories - $2::numeric) * 100 >= $2::numeric * $7
        OR abs(protein - $3::numeric) * 100 >= $3::numeric * $7
        OR abs(fat - $4::numeric) * 100 >= $4::numeric * $7
        OR abs(carbs - $5::numeric) * 100 >= $5::numeric * $7
      ) AS severe
    FROM totals
  `,
      [
        ctx.today,
        goals.calories,
        goals.protein,
        goals.fat,
        goals.carbs,
        balance.tolerancePercent,
        balance.severeDeviationPercent,
      ],
    ),
  );

  if (Number(totals.entries) === 0) {
    return;
  }
  if (totals.within) {
    await applyEffect(ctx, { xp: balance.rewardXp, stats: {} });
  } else if (totals.severe) {
    await applyEffect(ctx, { xp: balance.penaltyXp, stats: {} }, -1);
  }
}

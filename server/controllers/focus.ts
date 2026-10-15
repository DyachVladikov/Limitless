import { ApiError } from '../core/errors';
import { amount, cents } from '../core/money';
import { insert, one, requireRow } from '../core/sql';
import type { GameContext, Input, Row } from '../core/types';
import { integer, only, uuid } from '../core/validation';
import { applyEffect, dayBalance } from '../game/effects';

export async function getFocusSummary(ctx: GameContext, _input: Input): Promise<Row> {
  const totals = requireRow<Row>(
    await one<Row>(
      ctx.db,
      `
    SELECT coalesce(sum(duration_seconds), 0) AS duration_seconds,
      coalesce(sum(credited_seconds), 0) AS credited_seconds,
      coalesce(sum(awarded_xp), 0) AS awarded_xp
    FROM focus_sessions WHERE game_date = $1
  `,
      [ctx.today],
    ),
  );
  return { ...totals, game_date: ctx.today, daily_limit_seconds: dayBalance(ctx).focusDailySeconds };
}

export async function saveFocusSession(ctx: GameContext, input: Input): Promise<Row> {
  only(input.body, ['id', 'durationSeconds']);
  const id = uuid(input.body.id);
  const duration = integer(input.body.durationSeconds, 'durationSeconds', 1, 2147483647);
  const previous = await one(ctx.db, 'SELECT * FROM focus_sessions WHERE id = $1', [id]);
  if (previous) {
    if (previous.duration_seconds !== duration) {
      throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'This ID belongs to a different saved duration');
    }
    return previous;
  }

  const balance = dayBalance(ctx);
  const summary = await getFocusSummary(ctx, input);
  const alreadyCredited = Number(summary.credited_seconds);
  const remaining = Math.max(0, balance.focusDailySeconds - alreadyCredited);
  const credited = Math.min(duration, remaining);
  // Округляем накопленный итог, иначе короткие сессии теряют дробные сотые XP.
  const totalAward = Math.floor(((alreadyCredited + credited) * cents(balance.focusXpPerMinute)) / 60);
  const award = Math.max(0, totalAward - cents(summary.awarded_xp));
  const reward = await applyEffect(ctx, { xp: amount(award), stats: {} });
  return insert(ctx.db, 'focus_sessions', {
    id,
    game_date: ctx.today,
    duration_seconds: duration,
    credited_seconds: credited,
    awarded_xp: amount(cents(reward.xp)),
    balance_version: balance.version,
    saved_at: ctx.now,
  });
}

import { randomUUID } from 'node:crypto';
import { BALANCE, balanceFor, STAT_KEYS } from '../config/balance';
import { ApiError } from '../core/errors';
import { amount, cents } from '../core/money';
import { update } from '../core/sql';
import type { GameContext, Row } from '../core/types';

export type Effect = { xp: number; stats: Record<string, number> };
export type EffectInput = { xp: string | number; stats: Record<string, number> };

export function rankIndex(rank: string): number {
  return BALANCE.ranks.findIndex((entry) => entry.rank === rank);
}

export function currentRank(profile: Row): string {
  const total = cents(profile.total_exp);
  let rank = BALANCE.ranks[0].rank;
  for (const threshold of BALANCE.ranks) {
    if (total < threshold.xp * 100) {
      break;
    }
    rank = threshold.rank;
  }
  return rank;
}

export async function saveProfile(ctx: GameContext, patch: Row): Promise<void> {
  if (Object.keys(patch).length === 0) {
    return;
  }
  ctx.profile = await update(ctx.db, 'profiles', { id: 1 }, patch);
}

export async function reconcileRank(ctx: GameContext, previousRank?: string): Promise<void> {
  const rank = currentRank(ctx.profile);
  const patch: Row = {};
  if (rankIndex(rank) > rankIndex(ctx.profile.highest_rank)) {
    patch.highest_rank = rank;
  }
  if (previousRank && previousRank !== rank) {
    // Непоказанные переходы объединяем от исходного ранга; возврат убирает уведомление.
    const fromRank = ctx.profile.pending_rank_change?.fromRank ?? previousRank;
    patch.pending_rank_change = null;
    if (fromRank !== rank) {
      patch.pending_rank_change = {
        id: randomUUID(),
        fromRank,
        toRank: rank,
        changedAt: ctx.now,
      };
    }
    let type = 'rank_down';
    if (rankIndex(rank) > rankIndex(previousRank)) {
      type = 'rank_up';
    }
    ctx.events.push({ type, fromRank: previousRank, toRank: rank });
  }
  await saveProfile(ctx, patch);
}

export async function applyEffect(
  ctx: GameContext,
  effect: EffectInput,
  direction: 1 | -1 = 1,
): Promise<Effect> {
  const previousRank = currentRank(ctx.profile);
  const before = cents(ctx.profile.total_exp);
  const requested = cents(effect.xp);
  if (requested < 0) {
    throw new ApiError(400, 'INVALID_EFFECT', 'Effect XP must be nonnegative');
  }
  const after = Math.max(0, before + direction * requested);
  if (!Number.isSafeInteger(after) || after > 99999999999999) {
    throw new ApiError(409, 'XP_OVERFLOW', 'XP limit exceeded');
  }

  // Сохраняем фактическое изменение: отмена не должна уходить ниже нуля.
  const applied: Effect = { xp: Number(amount(Math.abs(after - before))), stats: {} };
  const patch: Row = {};
  if (after !== before) {
    patch.total_exp = amount(after);
  }
  for (const [key, value] of Object.entries(effect.stats)) {
    if (!(STAT_KEYS as readonly string[]).includes(key) || !Number.isSafeInteger(value) || value < 0) {
      throw new ApiError(400, 'INVALID_EFFECT', 'Invalid statistic effect');
    }
    const oldValue = Number(ctx.profile[`stat_${key}`]);
    const newValue = Math.max(0, oldValue + direction * value);
    if (newValue > 2147483647) {
      throw new ApiError(409, 'STAT_OVERFLOW', 'Statistic limit exceeded');
    }
    applied.stats[key] = Math.abs(newValue - oldValue);
    if (newValue !== oldValue) {
      patch[`stat_${key}`] = newValue;
    }
  }
  await saveProfile(ctx, patch);
  await reconcileRank(ctx, previousRank);
  return applied;
}

export function profileView(profile: Row): Row {
  const total = cents(profile.total_exp);
  const rank = currentRank(profile);
  const nextRank = BALANCE.ranks[rankIndex(rank) + 1];
  const levelSize = BALANCE.xpPerLevel * 100;
  return {
    ...profile,
    rank,
    level: Math.floor(total / levelSize) + 1,
    level_exp: amount(total % levelSize),
    next_level_exp: amount(levelSize),
    next_rank: nextRank?.rank ?? null,
    next_rank_exp: nextRank ? amount(nextRank.xp * 100) : null,
    balance_version: BALANCE.version,
    stat_stages: BALANCE.statStages,
  };
}

export function dayBalance(ctx: GameContext) {
  return balanceFor(ctx.profile.day_balance_version ?? BALANCE.version);
}

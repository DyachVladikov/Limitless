import { randomUUID } from 'node:crypto';
import { BALANCE, balanceFor, STAT_KEYS } from '../../config/balance';
import type { GameContext, Row } from '../../core/types';
import { update } from '../../core/sql';
import { cents, amount } from '../../core/money';
import { ApiError } from '../../core/errors';

export type Effect = { xp: number; stats: Record<string, number> };
export type EffectInput = { xp: string | number; stats: Record<string, number> };
export function rankIndex(rank: string): number { return BALANCE.ranks.findIndex(r => r.rank === rank); }
export function currentRank(profile: Row): string {
  const xp = cents(profile.total_exp);
  return [...BALANCE.ranks].reverse().find(r => xp >= r.xp * 100)!.rank;
}
export async function saveProfile(ctx: GameContext, patch: Row): Promise<void> {
  if (Object.keys(patch).length) ctx.profile = await update(ctx.db, 'profiles', { id: 1 }, patch);
}
export async function reconcileRank(ctx: GameContext, previousRank?: string): Promise<void> {
  const to = currentRank(ctx.profile);
  const patch: Row = {};
  if (rankIndex(to) > rankIndex(ctx.profile.highest_rank)) patch.highest_rank = to;
  if (previousRank && previousRank !== to) {
    const from = ctx.profile.pending_rank_change?.fromRank ?? previousRank;
    patch.pending_rank_change = from === to ? null : { id: randomUUID(), fromRank: from, toRank: to, changedAt: ctx.now };
    ctx.events.push({ type: rankIndex(to) > rankIndex(previousRank) ? 'rank_up' : 'rank_down',fromRank:previousRank,toRank:to });
  }
  await saveProfile(ctx, patch);
}

/** Returns actual nonnegative magnitudes, including floor-to-zero compensation. */
export async function applyEffect(ctx: GameContext, effect: EffectInput, direction: 1 | -1 = 1): Promise<Effect> {
  const beforeRank = currentRank(ctx.profile);
  const before = cents(ctx.profile.total_exp);
  const requested = cents(effect.xp);
  if (requested < 0) throw new ApiError(400, 'INVALID_EFFECT', 'Effect XP must be nonnegative');
  const after = Math.max(0, before + direction * requested);
  if (!Number.isSafeInteger(after) || after > 99999999999999) throw new ApiError(409, 'XP_OVERFLOW', 'XP limit exceeded');
  const actual: Effect = { xp: Number(amount(Math.abs(after - before))), stats: {} };
  const patch: Row = {};
  if (after !== before) patch.total_exp = amount(after);
  for (const [key, value] of Object.entries(effect.stats)) {
    if (!(STAT_KEYS as readonly string[]).includes(key) || !Number.isSafeInteger(value) || value < 0) {
      throw new ApiError(400, 'INVALID_EFFECT', 'Invalid statistic effect');
    }
    const old = Number(ctx.profile[`stat_${key}`]);
    const next = Math.max(0, old + direction * value);
    if (next > 2147483647) throw new ApiError(409, 'STAT_OVERFLOW', 'Statistic limit exceeded');
    actual.stats[key] = Math.abs(next - old);
    if (next !== old) patch[`stat_${key}`] = next;
  }
  await saveProfile(ctx, patch);
  await reconcileRank(ctx, beforeRank);
  return actual;
}

export function profileView(profile: Row): Row {
  const xp = cents(profile.total_exp);
  const rank = currentRank(profile);
  const next = BALANCE.ranks[rankIndex(rank) + 1];
  const levelSize = BALANCE.xpPerLevel * 100;
  return { ...profile, rank, level: Math.floor(xp / levelSize) + 1,
    level_exp: amount(xp % levelSize), next_level_exp: amount(levelSize),
    next_rank: next?.rank ?? null, next_rank_exp: next ? amount(next.xp * 100) : null,
    balance_version: BALANCE.version, stat_stages: BALANCE.statStages };
}
export function dayBalance(ctx: GameContext) { return balanceFor(ctx.profile.day_balance_version ?? BALANCE.version); }

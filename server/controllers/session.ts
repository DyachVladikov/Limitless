import { inPeriods } from '../core/dates';
import type { GameContext, Input, Row } from '../core/types';
import { only } from '../core/validation';
import { applyEffect, dayBalance, profileView, saveProfile } from '../game/effects';
import { settleGame } from '../game/settlement';

export async function openSession(ctx: GameContext, input: Input): Promise<Row> {
  only(input.body, []);
  const absent = inPeriods(ctx.profile.planned_absences, ctx.today);
  if (absent || ctx.profile.last_login_date === ctx.today) {
    return profileView(ctx.profile);
  }

  const streak = Number(ctx.profile.login_streak) + 1;
  const rewards = dayBalance(ctx).loginRewards;
  const rewardIndex = Math.min(streak, rewards.length) - 1;
  await applyEffect(ctx, { xp: rewards[rewardIndex], stats: {} });
  await saveProfile(ctx, { login_streak: streak, last_login_date: ctx.today });
  await settleGame(ctx);
  return profileView(ctx.profile);
}

import { ApiError } from '../core/errors';
import type { GameContext, Input, Row } from '../core/types';
import { expectVersion, only, uuid } from '../core/validation';
import { profileView, saveProfile } from '../game/effects';
import { editProfile } from '../game/profile';

export async function getProfile(ctx: GameContext, _input: Input): Promise<Row> {
  return profileView(ctx.profile);
}

export async function patchProfile(ctx: GameContext, input: Input): Promise<Row> {
  return editProfile(ctx, input.body);
}

export async function acknowledgeRankChange(ctx: GameContext, input: Input): Promise<Row> {
  only(input.body, ['id', 'version']);
  const id = uuid(input.body.id);
  expectVersion(ctx.profile, input.body.version);
  if (ctx.profile.pending_rank_change?.id !== id) {
    throw new ApiError(409, 'STALE_NOTIFICATION', 'Rank notification has changed');
  }
  await saveProfile(ctx, { pending_rank_change: null });
  return profileView(ctx.profile);
}

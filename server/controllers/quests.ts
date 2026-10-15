import { ApiError } from '../core/errors';
import { all, one, requireRow, update } from '../core/sql';
import type { GameContext, Input, Row } from '../core/types';
import { expectVersion, integer, only, uuid } from '../core/validation';
import { metrics, settleGame } from '../game/settlement';

export async function listQuests(ctx: GameContext, _input: Input): Promise<Row[]> {
  const facts = await metrics(ctx);
  const quests = await all(
    ctx.db,
    `
    SELECT * FROM quests WHERE is_enabled OR completed_at IS NOT NULL
    ORDER BY completed_at NULLS FIRST, created_at, id
  `,
  );
  return quests.map((quest) => {
    let progress = quest.manual_progress;
    if (quest.progress_mode === 'metric') {
      progress = facts[quest.metric_key];
    }
    return { ...quest, progress };
  });
}

export async function setQuestProgress(ctx: GameContext, input: Input): Promise<Row> {
  only(input.body, ['version', 'progress']);
  const id = uuid(input.params.id);
  const quest = requireRow<Row>(await one<Row>(ctx.db, 'SELECT * FROM quests WHERE id = $1', [id]));
  expectVersion(quest, input.body.version);
  const progress = integer(input.body.progress, 'progress');
  if (quest.progress_mode !== 'manual' || !quest.unlocked_at || !quest.is_enabled) {
    throw new ApiError(409, 'QUEST_UNAVAILABLE', 'Only unlocked manual quests accept progress');
  }
  if (quest.completed_at && progress !== quest.manual_progress) {
    throw new ApiError(409, 'QUEST_COMPLETED', 'Completed quest progress cannot be changed');
  }
  if (progress !== quest.manual_progress) {
    await update(ctx.db, 'quests', { id }, { manual_progress: progress });
  }
  await settleGame(ctx);
  return requireRow<Row>(await one<Row>(ctx.db, 'SELECT * FROM quests WHERE id = $1', [id]));
}

export async function acknowledgeQuest(ctx: GameContext, input: Input): Promise<Row> {
  only(input.body, ['version']);
  const id = uuid(input.params.id);
  const quest = requireRow<Row>(await one<Row>(ctx.db, 'SELECT * FROM quests WHERE id = $1', [id]));
  expectVersion(quest, input.body.version);
  if (!quest.completed_at) {
    throw new ApiError(409, 'QUEST_INCOMPLETE', 'Quest is not complete');
  }
  if (quest.completion_seen_at) {
    return quest;
  }
  return update(ctx.db, 'quests', { id }, { completion_seen_at: ctx.now });
}

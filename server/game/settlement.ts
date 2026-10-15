import { ApiError } from '../core/errors';
import { all, update } from '../core/sql';
import type { GameContext, Row } from '../core/types';
import { settleActivity } from './activity';
import { applyEffect, rankIndex, reconcileRank } from './effects';
import { metrics, settleDailySet } from './metrics';

export { metrics, incrementCounter } from './metrics';

function questProgress(quest: Row, facts: Record<string, number>): number {
  if (quest.progress_mode === 'metric') {
    return facts[quest.metric_key];
  }
  return quest.manual_progress;
}

export async function assertCompletedQuests(ctx: GameContext): Promise<void> {
  await settleDailySet(ctx);
  const facts = await metrics(ctx);
  const completed = await all(ctx.db, 'SELECT * FROM quests WHERE completed_at IS NOT NULL');
  const invalidIds: string[] = [];
  for (const quest of completed) {
    if (questProgress(quest, facts) < quest.target_count) {
      invalidIds.push(quest.id);
    }
  }
  if (invalidIds.length > 0) {
    throw new ApiError(409, 'COMPLETED_QUEST_DEPENDENCY', 'This edit would invalidate a completed quest', {
      questIds: invalidIds,
    });
  }
}

export async function settleGame(ctx: GameContext): Promise<void> {
  await settleDailySet(ctx);
  const facts = await metrics(ctx);

  // Награда может открыть следующий ранг. Каждый новый проход завершает хотя бы один квест.
  let hasNewCompletions = true;
  while (hasNewCompletions) {
    hasNewCompletions = false;
    await reconcileRank(ctx);
    const unfinished = await all(
      ctx.db,
      `
      SELECT * FROM quests WHERE is_enabled AND completed_at IS NULL
      ORDER BY required_rank, id
    `,
    );

    for (let quest of unfinished) {
      const rankReached = rankIndex(quest.required_rank) <= rankIndex(ctx.profile.highest_rank);
      if (!quest.unlocked_at && rankReached) {
        quest = await update(ctx.db, 'quests', { id: quest.id }, { unlocked_at: ctx.now });
      }
      if (!quest.unlocked_at) {
        continue;
      }
      if (questProgress(quest, facts) < quest.target_count) {
        continue;
      }

      const reward = await applyEffect(ctx, { xp: quest.reward_xp, stats: quest.reward_stats });
      await update(
        ctx.db,
        'quests',
        { id: quest.id },
        {
          completed_at: ctx.now,
          completed_on: ctx.today,
          applied_reward: reward,
        },
      );
      ctx.events.push({ type: 'quest_completed', questId: quest.id });
      hasNewCompletions = true;
    }
  }
  await settleActivity(ctx);
}

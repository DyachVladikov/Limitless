import type { GameContext, Input } from '../core/types';
import { getProfile, patchProfile, acknowledgeRankChange } from '../controllers/profile';
import { openSession } from '../controllers/session';
import { getTodayTasks, setTaskCompleted } from '../controllers/tasks';
import { listQuests, setQuestProgress, acknowledgeQuest } from '../controllers/quests';
import { getFocusSummary, saveFocusSession } from '../controllers/focus';

type Handler = (ctx: GameContext, input: Input) => Promise<unknown>;

export const gameHandlers: Record<string, Handler> = {
  'GET /profile': getProfile,
  'PATCH /profile': patchProfile,
  'POST /profile/rank-change/seen': acknowledgeRankChange,
  'POST /session/open': openSession,
  'GET /tasks/today': getTodayTasks,
  'PATCH /tasks/today/:id': setTaskCompleted,
  'GET /quests': listQuests,
  'PATCH /quests/:id/progress': setQuestProgress,
  'POST /quests/:id/seen': acknowledgeQuest,
  'GET /focus': getFocusSummary,
  'POST /focus': saveFocusSession,
};

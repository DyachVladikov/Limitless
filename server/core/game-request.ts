import { transaction, type TransactionRunner } from './database';
import { requireOwner } from './auth';
import { openLocalApi } from './auth-config';
import { guardOrigin, readBody, respond, respondError } from './http';
import { ApiError } from './errors';
import { moscowDate } from './dates';
import { one } from './sql';
import { serialize } from './serialize';
import { createProfile } from '../game/profile';
import { prepareDay } from '../game/days';
import { assertCompletedQuests, settleGame } from '../game/settlement';
import { profileView } from '../game/effects';
import { mentorReactions } from '../controllers/mentors/reactions';
import type { GameContext, Input, Row, Sql } from './types';

export type GameAction = (ctx: GameContext, input: Input) => Promise<unknown>;
export type IdContext = { params: Promise<{ id: string }> };

export interface RequestRuntime {
  runTransaction: TransactionRunner;
  now(): string;
}

export const requestRuntime: RequestRuntime = {
  runTransaction: transaction,
  now: () => new Date().toISOString(),
};

interface RequestOptions {
  params?: Record<string, string>;
  status?: number;
  createProfile?: boolean;
}

export async function loadGame(db: Sql, now: string): Promise<GameContext> {
  const profile = await one<Row>(db, 'SELECT * FROM profiles WHERE id=1');
  if (!profile) {
    throw new ApiError(404, 'PROFILE_NOT_CONFIGURED', 'Сначала создайте профиль через POST /api/profile');
  }
  return { db, profile, now, today: moscowDate(now), events: [] };
}

// Общие шаги каждой игровой ручки. Сама операция находится в controllers/.
export async function gameRequest(
  request: Request,
  action: GameAction,
  options: RequestOptions = {},
  runtime: RequestRuntime = requestRuntime,
): Promise<Response> {
  try {
    guardOrigin(request);
    if (!openLocalApi()) await requireOwner(request);

    const writing = request.method !== 'GET' && request.method !== 'HEAD';
    const body = writing ? await readBody(request) : {};
    const now = runtime.now();
    const today = moscowDate(now);
    const result = await runtime.runTransaction(async (db) => {
      if (options.createProfile) await createProfile(db, body, now);
      const ctx = await loadGame(db, now);
      const dayOpen = ctx.profile.current_day === today;

      // GET of an already-open day is a short read. Opening the day still settles.
      if (writing || !dayOpen) {
        await prepareDay(ctx);
        await settleGame(ctx);
      }

      const data = await action(ctx, {
        body,
        params: options.params ?? {},
        query: new URL(request.url).searchParams,
      });

      if (writing) {
        await assertCompletedQuests(ctx);
        await settleGame(ctx);
        await mentorReactions(ctx);
      } else if (!dayOpen) {
        await settleGame(ctx);
        await mentorReactions(ctx);
      }

      return serialize({
        data,
        profile: profileView(ctx.profile),
        events: ctx.events,
        meta: { gameDate: ctx.today, profileVersion: String(ctx.profile.version) },
      });
    });

    return respond(request, result, options.status ?? 200);
  } catch (error) {
    // transaction() откатывает и запись, и награды при любой ошибке.
    return respondError(request, error);
  }
}

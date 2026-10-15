import { handleAuth, requireJob } from './auth';
import { guardOrigin, preflight, respond, respondError } from './http';
import { ApiError } from './errors';
import { one } from './sql';
import { moscowDate } from './dates';
import { prepareDay } from '../game/days';
import { settleGame } from '../game/settlement';
import { requestRuntime, type RequestRuntime } from './game-request';
import type { GameContext } from './types';

export function healthRequest(request: Request): Response {
  try {
    guardOrigin(request);
    return respond(request, { status: 'ok' });
  } catch (error) {
    return respondError(request, error);
  }
}

export async function authRequest(request: Request): Promise<Response> {
  try {
    const path = new URL(request.url).pathname.slice(4).replace(/\/$/, '');
    return (await handleAuth(request, path)) ?? notFoundRequest(request);
  } catch (error) {
    return respondError(request, error);
  }
}

export async function rolloverRequest(
  request: Request,
  runtime: RequestRuntime = requestRuntime,
): Promise<Response> {
  try {
    guardOrigin(request);
    requireJob(request);
    const now = runtime.now();
    const data = await runtime.runTransaction(async (db) => {
      const profile = await one(db, 'SELECT * FROM profiles WHERE id=1 FOR UPDATE');
      if (!profile) return { configured: false };

      const ctx: GameContext = { db, profile, now, today: moscowDate(now), events: [] };
      await prepareDay(ctx);
      await settleGame(ctx);
      return { configured: true, gameDate: ctx.today, lastClosedDay: ctx.profile.last_closed_day };
    });
    return respond(request, data);
  } catch (error) {
    return respondError(request, error);
  }
}

export function optionsRequest(request: Request): Response {
  try {
    return preflight(request);
  } catch (error) {
    return respondError(request, error);
  }
}

export function methodNotAllowed(request: Request, allowed: string[] = []): Response {
  try {
    guardOrigin(request);
    const error = new ApiError(405, 'METHOD_NOT_ALLOWED', 'Метод не поддерживается');
    const response = respondError(request, error);
    response.headers.set('Allow', allowed.join(', '));
    return response;
  } catch (error) {
    return respondError(request, error);
  }
}

export function notFoundRequest(request: Request): Response {
  try {
    guardOrigin(request);
    throw new ApiError(404, 'NOT_FOUND', 'Маршрут не найден');
  } catch (error) {
    return respondError(request, error);
  }
}

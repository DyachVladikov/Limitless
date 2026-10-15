import { gameRequest, requestRuntime, type RequestRuntime } from '../core/game-request';
import { authRequest, healthRequest, methodNotAllowed, notFoundRequest, optionsRequest, rolloverRequest } from '../core/system-request';
import { respondError } from '../core/http';
import { ApiError } from '../core/errors';
import { testRoutes } from './routes';

// Только для тестов: подставляем изолированную БД и фиксированное время.
// В приложении адреса выбирает Next.js по файлам app/api/**/route.ts.
export function createHandler(overrides: Partial<RequestRuntime> = {}) {
  const runtime = { ...requestRuntime, ...overrides };
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return optionsRequest(request);
    const path = new URL(request.url).pathname.slice(4).replace(/\/$/, '');
    if (path.startsWith('/auth/')) return authRequest(request);
    if (path === '/health') {
      return ['GET', 'HEAD'].includes(request.method)
        ? healthRequest(request)
        : methodNotAllowed(request, ['GET', 'HEAD', 'OPTIONS']);
    }
    if (path === '/jobs/rollover') {
      return request.method === 'POST'
        ? rolloverRequest(request, runtime)
        : methodNotAllowed(request, ['POST', 'OPTIONS']);
    }

    const allowed: string[] = [];
    for (const route of testRoutes) {
      const actual = path.split('/');
      const expected = route.path.split('/');
      if (actual.length !== expected.length) continue;
      if (expected.some((part, i) => !part.startsWith(':') && part !== actual[i])) continue;
      allowed.push(route.method);
      if (route.method !== request.method) continue;

      const params: Record<string, string> = {};
      try {
        expected.forEach((part, i) => {
          if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(actual[i]);
        });
      } catch {
        return respondError(request, new ApiError(400, 'INVALID_PATH', 'Некорректный параметр URL'));
      }
      return gameRequest(request, route.handle, {
        params,
        status: route.status,
        createProfile: route.setup,
      }, runtime);
    }
    if (!allowed.length) return notFoundRequest(request);
    if (allowed.includes('GET')) allowed.push('HEAD');
    allowed.push('OPTIONS');
    return methodNotAllowed(request, allowed);
  };
}

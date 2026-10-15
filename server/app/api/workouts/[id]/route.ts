import { methodNotAllowed, optionsRequest } from '../../../../core/system-request';
import { gameRequest, type IdContext } from '../../../../core/game-request';
import { getWorkout, updateWorkout } from '../../../../controllers/workouts/controller';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: IdContext) {
  const params = await context.params;
  return gameRequest(request, getWorkout, { params });
}

export async function PATCH(request: Request, context: IdContext) {
  const params = await context.params;
  return gameRequest(request, updateWorkout, { params });
}

export { GET as HEAD };
function unsupported(request: Request) {
  return methodNotAllowed(request, ['GET', 'PATCH', 'HEAD', 'OPTIONS']);
}

export { optionsRequest as OPTIONS, unsupported as POST, unsupported as PUT, unsupported as DELETE };

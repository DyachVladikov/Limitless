import { methodNotAllowed, optionsRequest } from '../../../../../../core/system-request';
import { gameRequest, type IdContext } from '../../../../../../core/game-request';
import { getExerciseHistory } from '../../../../../../controllers/exercises';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: IdContext) {
  const params = await context.params;
  return gameRequest(request, getExerciseHistory, { params });
}

export { GET as HEAD };
function unsupported(request: Request) {
  return methodNotAllowed(request, ['GET', 'HEAD', 'OPTIONS']);
}

export {
  optionsRequest as OPTIONS,
  unsupported as POST,
  unsupported as PATCH,
  unsupported as PUT,
  unsupported as DELETE,
};

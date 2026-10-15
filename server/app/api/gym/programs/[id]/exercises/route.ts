import { methodNotAllowed, optionsRequest } from '../../../../../../core/system-request';
import { gameRequest, type IdContext } from '../../../../../../core/game-request';
import { replaceProgramExercises } from '../../../../../../controllers/programs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: Request, context: IdContext) {
  const params = await context.params;
  return gameRequest(request, replaceProgramExercises, { params });
}

function unsupported(request: Request) {
  return methodNotAllowed(request, ['PUT', 'OPTIONS']);
}

export {
  optionsRequest as OPTIONS,
  unsupported as GET,
  unsupported as POST,
  unsupported as PATCH,
  unsupported as DELETE,
  unsupported as HEAD,
};

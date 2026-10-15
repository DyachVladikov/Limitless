import { methodNotAllowed, optionsRequest } from '../../../../../core/system-request';
import { gameRequest, type IdContext } from '../../../../../core/game-request';
import { setCodingResult } from '../../../../../controllers/coding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: IdContext) {
  const params = await context.params;
  return gameRequest(request, setCodingResult, { params });
}

function unsupported(request: Request) {
  return methodNotAllowed(request, ['PATCH', 'OPTIONS']);
}

export {
  optionsRequest as OPTIONS,
  unsupported as GET,
  unsupported as POST,
  unsupported as PUT,
  unsupported as DELETE,
  unsupported as HEAD,
};

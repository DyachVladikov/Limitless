import { methodNotAllowed, optionsRequest } from '../../../../../core/system-request';
import { gameRequest, type IdContext } from '../../../../../core/game-request';
import { disableProgram, getProgram, updateProgram } from '../../../../../controllers/programs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: IdContext) {
  const params = await context.params;
  return gameRequest(request, getProgram, { params });
}

export async function PATCH(request: Request, context: IdContext) {
  const params = await context.params;
  return gameRequest(request, updateProgram, { params });
}

export async function DELETE(request: Request, context: IdContext) {
  const params = await context.params;
  return gameRequest(request, disableProgram, { params });
}

export { GET as HEAD };
function unsupported(request: Request) {
  return methodNotAllowed(request, ['GET', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
}

export { optionsRequest as OPTIONS, unsupported as POST, unsupported as PUT };

import { methodNotAllowed, optionsRequest } from '../../../../core/system-request';
import { gameRequest, type IdContext } from '../../../../core/game-request';
import { archiveSubject, getSubject, updateSubject } from '../../../../controllers/subjects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: IdContext) {
  const params = await context.params;
  return gameRequest(request, getSubject, { params });
}

export async function PATCH(request: Request, context: IdContext) {
  const params = await context.params;
  return gameRequest(request, updateSubject, { params });
}

export async function DELETE(request: Request, context: IdContext) {
  const params = await context.params;
  return gameRequest(request, archiveSubject, { params });
}

export { GET as HEAD };
function unsupported(request: Request) {
  return methodNotAllowed(request, ['GET', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
}

export { optionsRequest as OPTIONS, unsupported as POST, unsupported as PUT };

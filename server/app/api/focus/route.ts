import { methodNotAllowed, optionsRequest } from '../../../core/system-request';
import { gameRequest } from '../../../core/game-request';
import { getFocusSummary, saveFocusSession } from '../../../controllers/focus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return gameRequest(request, getFocusSummary);
}

export async function POST(request: Request) {
  return gameRequest(request, saveFocusSession, { status: 201 });
}

export { GET as HEAD };
function unsupported(request: Request) {
  return methodNotAllowed(request, ['GET', 'POST', 'HEAD', 'OPTIONS']);
}

export { optionsRequest as OPTIONS, unsupported as PATCH, unsupported as PUT, unsupported as DELETE };

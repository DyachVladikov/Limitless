import { methodNotAllowed, optionsRequest } from '../../../../../core/system-request';
import { gameRequest, type IdContext } from '../../../../../core/game-request';
import { acknowledgeQuest } from '../../../../../controllers/quests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: IdContext) {
  const params = await context.params;
  return gameRequest(request, acknowledgeQuest, { params });
}

function unsupported(request: Request) {
  return methodNotAllowed(request, ['POST', 'OPTIONS']);
}

export {
  optionsRequest as OPTIONS,
  unsupported as GET,
  unsupported as PATCH,
  unsupported as PUT,
  unsupported as DELETE,
  unsupported as HEAD,
};

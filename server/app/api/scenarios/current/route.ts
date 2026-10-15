import { methodNotAllowed, optionsRequest } from '../../../../core/system-request';
import { gameRequest } from '../../../../core/game-request';
import { getCurrentScenario } from '../../../../controllers/scenarios';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return gameRequest(request, getCurrentScenario);
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

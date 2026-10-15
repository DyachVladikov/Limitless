import { methodNotAllowed, optionsRequest } from '../../../core/system-request';
import { gameRequest } from '../../../core/game-request';
import { getProfile, patchProfile } from '../../../controllers/profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return gameRequest(request, getProfile);
}

export async function PATCH(request: Request) {
  return gameRequest(request, patchProfile);
}

export async function POST(request: Request) {
  return gameRequest(request, getProfile, { status: 201, createProfile: true });
}

export { GET as HEAD };
function unsupported(request: Request) {
  return methodNotAllowed(request, ['GET', 'PATCH', 'POST', 'HEAD', 'OPTIONS']);
}

export { optionsRequest as OPTIONS, unsupported as PUT, unsupported as DELETE };

import { methodNotAllowed, optionsRequest } from '../../../../../core/system-request';
import { gameRequest } from '../../../../../core/game-request';
import { markMentorPopupSeen } from '../../../../../controllers/mentors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return gameRequest(request, markMentorPopupSeen);
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

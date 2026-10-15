import { methodNotAllowed, optionsRequest } from '../../../core/system-request';
import { gameRequest } from '../../../core/game-request';
import { createBook, listBooks } from '../../../controllers/books';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return gameRequest(request, listBooks);
}

export async function POST(request: Request) {
  return gameRequest(request, createBook, { status: 201 });
}

export { GET as HEAD };
function unsupported(request: Request) {
  return methodNotAllowed(request, ['GET', 'POST', 'HEAD', 'OPTIONS']);
}

export { optionsRequest as OPTIONS, unsupported as PATCH, unsupported as PUT, unsupported as DELETE };

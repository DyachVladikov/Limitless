import { methodNotAllowed, optionsRequest } from '../../../../../core/system-request';
import { gameRequest, type IdContext } from '../../../../../core/game-request';
import { deleteNutritionEntry, updateNutritionEntry } from '../../../../../controllers/nutrition/controller';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: IdContext) {
  const params = await context.params;
  return gameRequest(request, updateNutritionEntry, { params });
}

export async function DELETE(request: Request, context: IdContext) {
  const params = await context.params;
  return gameRequest(request, deleteNutritionEntry, { params });
}

function unsupported(request: Request) {
  return methodNotAllowed(request, ['PATCH', 'DELETE', 'OPTIONS']);
}

export {
  optionsRequest as OPTIONS,
  unsupported as GET,
  unsupported as POST,
  unsupported as PUT,
  unsupported as HEAD,
};

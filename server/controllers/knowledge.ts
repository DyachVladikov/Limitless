import type { GameContext, Input, Row } from '../core/types';
import { all } from '../core/sql';
import { choice } from '../core/validation';

export async function listKnowledge(ctx: GameContext, { query }: Input): Promise<Row[]> {
  const kind = query.get('kind');
  if (kind) {
    choice(kind, 'kind', ['law', 'method', 'principle', 'other']);
  }
  return all(
    ctx.db,
    `
    SELECT * FROM knowledge_entries
    WHERE is_enabled AND ($1::text IS NULL OR kind = $1)
    ORDER BY sort_order, title, id
  `,
    [kind],
  );
}

import type { GameContext, Input, Row } from '../core/types';
import { all, insert, one, update } from '../core/sql';
import { boolean, choice, expectVersion, integer, only, optionalText, text, uuid } from '../core/validation';
import { conflict, invalid, rowById, sameValues } from '../core/inputs';

const bookFields = [
  'title',
  'author',
  'description',
  'sourceUrl',
  'progressUnit',
  'totalUnits',
  'readUnits',
  'isArchived',
];

function bookData(body: Row, current?: Row): Row {
  const patch: Row = {};
  if (!current || body.title !== undefined) {
    patch.title = text(body.title, 'title');
  }
  if (!current || body.author !== undefined) {
    patch.author = optionalText(body.author, 'author', 2000);
  }
  if (!current || body.description !== undefined) {
    patch.description = optionalText(body.description, 'description', 10000);
  }
  if (!current || body.sourceUrl !== undefined) {
    patch.source_url = optionalText(body.sourceUrl, 'sourceUrl', 2000);
  }
  if (!current || body.progressUnit !== undefined) {
    patch.progress_unit = choice(body.progressUnit, 'progressUnit', ['pages', 'chapters']);
  }
  if (
    current &&
    patch.progress_unit &&
    patch.progress_unit !== current.progress_unit &&
    current.read_units > 0
  ) {
    // Сначала нужен отдельный сброс прогресса, проверенный общим слоем квестов.
    conflict('Reset reading progress explicitly before changing its unit');
  }
  if (!current || body.totalUnits !== undefined) {
    patch.total_units = integer(body.totalUnits, 'totalUnits', 1);
  }
  if (!current || body.readUnits !== undefined) {
    patch.read_units = integer(body.readUnits === undefined ? 0 : body.readUnits, 'readUnits');
  }
  if (!current || body.isArchived !== undefined) {
    patch.is_archived = boolean(body.isArchived === undefined ? false : body.isArchived, 'isArchived');
  }

  const readUnits = patch.read_units ?? current?.read_units;
  const totalUnits = patch.total_units ?? current?.total_units;
  if (readUnits > totalUnits) {
    invalid('readUnits cannot exceed totalUnits');
  }
  return patch;
}

export async function listBooks(ctx: GameContext, { query }: Input): Promise<Row[]> {
  const includeArchived = query.get('includeArchived') === 'true';
  return all(
    ctx.db,
    `
    SELECT * FROM books WHERE ($1::boolean OR NOT is_archived)
    ORDER BY created_at, id
  `,
    [includeArchived],
  );
}

export async function getBook(ctx: GameContext, { params }: Input): Promise<Row> {
  return rowById(ctx, 'books', uuid(params.id));
}

export async function createBook(ctx: GameContext, { body }: Input): Promise<Row> {
  only(body, ['id', ...bookFields]);
  const id = uuid(body.id);
  const data = bookData(body);
  const existing = await one(ctx.db, 'SELECT * FROM books WHERE id = $1', [id]);
  if (existing) {
    sameValues(existing, data);
    return existing;
  }
  return insert(ctx.db, 'books', {
    id,
    ...data,
    completed_at: data.read_units === data.total_units ? ctx.now : null,
  });
}

export async function updateBook(ctx: GameContext, { body, params }: Input): Promise<Row> {
  only(body, ['version', ...bookFields]);
  const book = await rowById(ctx, 'books', uuid(params.id));
  expectVersion(book, body.version);

  const patch = bookData(body, book);
  const readUnits = patch.read_units ?? book.read_units;
  const totalUnits = patch.total_units ?? book.total_units;
  patch.completed_at = null;
  if (readUnits === totalUnits) {
    patch.completed_at = book.completed_at ?? ctx.now;
  }
  return update(ctx.db, 'books', { id: book.id }, patch);
}

export async function archiveBook(ctx: GameContext, { body, params }: Input): Promise<Row> {
  only(body, ['version']);
  const book = await rowById(ctx, 'books', uuid(params.id));
  expectVersion(book, body.version);
  return update(ctx.db, 'books', { id: book.id }, { is_archived: true });
}

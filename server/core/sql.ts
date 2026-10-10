import { ApiError, requireRow } from './errors';
import { columns, jsonColumns, type Table } from './schema';
import type { Row, Sql } from './types';
export { requireRow } from './errors';
export async function all<T = Row>(db: Sql, sql: string, values: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, values)).rows;
}
export async function one<T = Row>(db: Sql, sql: string, values: unknown[] = []): Promise<T | undefined> {
  return (await all<T>(db, sql, values))[0];
}
function identifiers(table: string, keys: string[]): asserts table is Table {
  if (!Object.hasOwn(columns, table) || !keys.length || keys.some(key => !(columns[table as Table] as readonly string[]).includes(key))) {
    throw new ApiError(500, 'INVALID_SQL_IDENTIFIER', 'Ошибка конфигурации хранилища');
  }
}
const quoted = (name: string) => `"${name}"`;
const encoded = (key: string, value: unknown) => value != null && jsonColumns.has(key) ? JSON.stringify(value) : value;
export async function insert<T = Row>(db: Sql, table: string, data: Row): Promise<T> {
  const keys = Object.keys(data);
  identifiers(table, keys);
  return requireRow(await one<T>(db, `INSERT INTO public.${quoted(table)} (${keys.map(quoted).join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`, keys.map(key => encoded(key, data[key]))));
}
export async function update<T = Row>(db: Sql, table: string, key: Row, patch: Row): Promise<T> {
  const entries = Object.keys(patch), keyNames = Object.keys(key);
  identifiers(table, entries); identifiers(table, keyNames);
  return requireRow(await one<T>(db, `UPDATE public.${quoted(table)} SET ${entries.map((name, i) => `${quoted(name)} = $${i + 1}`).join(', ')} WHERE ${keyNames.map((name, i) => `${quoted(name)} = $${entries.length + i + 1}`).join(' AND ')} RETURNING *`, [...entries.map(name => encoded(name, patch[name])), ...keyNames.map(name => encoded(name, key[name]))]));
}
export function normalizeRow<T>(row: T): T {
  if (row == null || typeof row !== 'object') return row;
  if (row instanceof Date) return row.toISOString() as T;
  if (Array.isArray(row)) return row.map(normalizeRow) as T;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, key === 'version' ? String(value) : normalizeRow(value)])) as T;
}

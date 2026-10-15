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
  if (!Object.hasOwn(columns, table) || keys.length === 0) {
    throw new ApiError(500, 'INVALID_SQL_IDENTIFIER', 'Ошибка конфигурации хранилища');
  }
  const allowed: readonly string[] = columns[table as Table];
  for (const key of keys) {
    if (!allowed.includes(key)) {
      throw new ApiError(500, 'INVALID_SQL_IDENTIFIER', 'Ошибка конфигурации хранилища');
    }
  }
}
const quoted = (name: string) => `"${name}"`;
const encoded = (key: string, value: unknown) =>
  value != null && jsonColumns.has(key) ? JSON.stringify(value) : value;

// Значения всегда передаются отдельно от SQL через $1, $2, ...
export async function insert<T = Row>(db: Sql, table: string, data: Row): Promise<T> {
  const keys = Object.keys(data);
  identifiers(table, keys);
  const names = keys.map(quoted).join(', ');
  const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
  const values = keys.map((key) => encoded(key, data[key]));
  const sql = `INSERT INTO public.${quoted(table)} (${names}) VALUES (${placeholders}) RETURNING *`;
  return requireRow(await one<T>(db, sql, values));
}
export async function update<T = Row>(db: Sql, table: string, key: Row, patch: Row): Promise<T> {
  const fields = Object.keys(patch);
  const keyNames = Object.keys(key);
  identifiers(table, fields);
  identifiers(table, keyNames);
  const assignments = fields.map((name, index) => `${quoted(name)} = $${index + 1}`);
  const conditions = keyNames.map((name, index) => `${quoted(name)} = $${fields.length + index + 1}`);
  const values = [
    ...fields.map((name) => encoded(name, patch[name])),
    ...keyNames.map((name) => encoded(name, key[name])),
  ];
  const sql = `UPDATE public.${quoted(table)} SET ${assignments.join(', ')} WHERE ${conditions.join(' AND ')} RETURNING *`;
  return requireRow(await one<T>(db, sql, values));
}
export function normalizeRow<T>(row: T): T {
  if (row == null || typeof row !== 'object') return row;
  if (row instanceof Date) return row.toISOString() as T;
  if (Array.isArray(row)) return row.map(normalizeRow) as T;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[key] = key === 'version' ? String(value) : normalizeRow(value);
  }
  return result as T;
}

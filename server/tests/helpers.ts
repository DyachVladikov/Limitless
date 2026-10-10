import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import type { GameContext, Row, Sql } from '../core/types';
import { normalizeRow } from '../core/sql';
import { moscowDate } from '../core/dates';
export async function createTestDatabase(): Promise<Sql & { close(): Promise<void> }> {
  const pg = new PGlite({ parsers: { 1082: (value: string) => value } });
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  await pg.exec(await readFile(new URL('../supabase/redesign/migrations/20261010000000_initial_schema.sql', import.meta.url), 'utf8'));
  return {
    async query<T = Row>(sql: string, params: unknown[] = []) {
      const result = await pg.query<T>(sql, params);
      return { rows: result.rows.map(normalizeRow), rowCount: result.affectedRows ?? result.rows.length };
    },
    close: () => pg.close(),
  };
}
export async function context(db: Sql, now = '2026-10-10T09:00:00.000Z'): Promise<GameContext> {
  const profile = (await db.query('SELECT * FROM public.profiles WHERE id = 1')).rows[0];
  if (!profile) throw new Error('Test profile must be created explicitly');
  return { db, profile, now, today: moscowDate(now), events: [] };
}
export async function inTransaction<T>(db: Sql, run: (db: Sql) => Promise<T>): Promise<T> {
  await db.query('BEGIN');
  try { const result = await run(db); await db.query('COMMIT'); return result; }
  catch (error) { await db.query('ROLLBACK'); throw error; }
}

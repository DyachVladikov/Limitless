import { Pool, types } from 'pg';
import { ApiError } from './errors';
import { openLocalApi } from './auth-config';
import { normalizeRow } from './sql';
import type { Row, Sql } from './types';

// Dates remain game-day strings; timestamptz is normalized to ISO at the boundary.
types.setTypeParser(1082, value => value);
let pool: Pool | undefined;
export function databasePool(): Pool {
  if (pool) return pool;
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', 'Подключение к БД ещё не настроено');
  let url: URL;
  try { url = new URL(raw); } catch { throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', 'Некорректная конфигурация подключения к БД'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', 'Ожидается PostgreSQL URL');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  // Connection-string sslmode must not silently override certificate verification.
  if (!local && ['disable', 'no-verify'].includes(url.searchParams.get('sslmode') ?? '')) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', 'Для удалённой БД требуется проверяемое TLS-соединение');
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  const size = Number(process.env.DATABASE_POOL_SIZE ?? '3');
  if (!Number.isSafeInteger(size) || size < 1 || size > 20) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', 'Некорректный размер пула БД');
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, '\n');
  pool = new Pool({
    connectionString: url.toString(), max: size, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
    ssl: local ? false : { rejectUnauthorized: Boolean(ca) || !openLocalApi(), ...(ca ? { ca } : {}) },
    application_name: 'limitless-backend',
  });
  pool.on('error', () => console.error('Idle PostgreSQL connection failed'));
  return pool;
}
export type TransactionRunner = <T>(run: (db: Sql) => Promise<T>) => Promise<T>;
export async function transaction<T>(run: (db: Sql) => Promise<T>): Promise<T> {
  const connection = await databasePool().connect();
  const db: Sql = { async query<R = Row>(sql: string, values: unknown[] = []) {
    // Unnamed parameterized queries work with Supabase transaction pooling.
    const result = await connection.query(sql, values);
    return { rows: result.rows.map(normalizeRow) as R[], rowCount: result.rowCount };
  } };
  try {
    await connection.query('BEGIN');
    await connection.query("SET LOCAL lock_timeout = '10s'");
    await connection.query("SET LOCAL statement_timeout = '30s'");
    await connection.query("SET LOCAL TIME ZONE 'UTC'");
    // Serializes singleton setup and all state changes, including concurrent cron.
    await connection.query('SELECT pg_advisory_xact_lock(1869376617, 1)');
    const result = await run(db);
    await connection.query('COMMIT');
    return result;
  } catch (error) {
    await connection.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { connection.release(); }
}

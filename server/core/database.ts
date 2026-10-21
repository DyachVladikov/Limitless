import { Pool, types, type PoolClient } from "pg";
import { ApiError, isDatabaseUnavailable, logServerError } from "./errors";
import { openLocalApi } from "./auth-config";
import { normalizeRow } from "./sql";
import type { Row, Sql } from "./types";

// Dates remain game-day strings; timestamptz is normalized to ISO at the boundary.
types.setTypeParser(1082, (value) => value);
// Next.js reloads server modules in development; keep one pool per process.
const databaseGlobal = globalThis as typeof globalThis & {
  limitlessDatabasePool?: Pool;
};

export function databasePool(): Pool {
  if (databaseGlobal.limitlessDatabasePool) return databaseGlobal.limitlessDatabasePool;
  const raw = process.env.DATABASE_URL;
  if (!raw)
    throw new ApiError(
      503,
      "DATABASE_NOT_CONFIGURED",
      "Подключение к БД ещё не настроено",
    );
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError(
      503,
      "DATABASE_NOT_CONFIGURED",
      "Некорректная конфигурация подключения к БД",
    );
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new ApiError(
      503,
      "DATABASE_NOT_CONFIGURED",
      "Ожидается PostgreSQL URL",
    );
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  // Connection-string sslmode must not silently override certificate verification.
  if (
    !local &&
    ["disable", "no-verify"].includes(url.searchParams.get("sslmode") ?? "")
  )
    throw new ApiError(
      503,
      "DATABASE_NOT_CONFIGURED",
      "Для удалённой БД требуется проверяемое TLS-соединение",
    );
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
    url.searchParams.delete(key);
  const size = Number(process.env.DATABASE_POOL_SIZE ?? "3");
  if (!Number.isSafeInteger(size) || size < 1 || size > 20)
    throw new ApiError(
      503,
      "DATABASE_NOT_CONFIGURED",
      "Некорректный размер пула БД",
    );
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
  const pool = new Pool({
    connectionString: url.toString(),
    max: size,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
    query_timeout: 20000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5000,
    ssl: local
      ? false
      : {
          rejectUnauthorized: Boolean(ca) || !openLocalApi(),
          ...(ca ? { ca } : {}),
        },
    application_name: "limitless-backend",
  });
  pool.on("error", (error) => logServerError("database.pool", error));
  pool.on("connect", (client) => {
    client.on("error", (error) => logServerError("database.connection", error));
  });
  databaseGlobal.limitlessDatabasePool = pool;
  return pool;
}

function sqlFrom(connection: PoolClient): Sql {
  return {
    async query<R = Row>(sql: string, values: unknown[] = []) {
      const result = await connection.query(sql, values);
      return {
        rows: result.rows.map(normalizeRow) as R[],
        rowCount: result.rowCount,
      };
    },
  };
}

export type TransactionRunner = <T>(run: (db: Sql) => Promise<T>) => Promise<T>;

async function runWithConnection<T>(run: (db: Sql) => Promise<T>, atomic: boolean): Promise<T> {
  let connection: PoolClient | undefined;
  let started = false;
  let discard = false;
  try {
    connection = await databasePool().connect();
    if (atomic) {
      await connection.query("BEGIN");
      started = true;
      await connection.query(`
        SET LOCAL lock_timeout = '10s';
        SET LOCAL statement_timeout = '15s';
        SET LOCAL idle_in_transaction_session_timeout = '15s';
        SET LOCAL TIME ZONE 'UTC'
      `);
      // One owner: serialize setup, rollover and rewards before reading the profile.
      // The lock is released automatically on COMMIT or ROLLBACK.
      await connection.query("SELECT pg_advisory_xact_lock(1869376617, 1)");
    }
    const result = await run(sqlFrom(connection));
    if (atomic) {
      await connection.query("COMMIT");
      started = false;
    }
    return result;
  } catch (error) {
    discard = isDatabaseUnavailable(error);
    // A broken connection may never answer ROLLBACK either. Discarding it closes
    // the session and lets PostgreSQL roll back without another network wait.
    if (connection && started && !discard) {
      try {
        await connection.query("ROLLBACK");
      } catch (rollbackError) {
        discard = true;
        logServerError("database.rollback", rollbackError);
      }
    }
    if (isDatabaseUnavailable(error)) {
      throw new ApiError(
        503,
        "DATABASE_UNAVAILABLE",
        "База данных временно недоступна",
        undefined,
        { cause: error },
      );
    }
    throw error;
  } finally {
    connection?.release(discard);
  }
}

export async function withDatabase<T>(run: (db: Sql) => Promise<T>): Promise<T> {
  return runWithConnection(run, false);
}

export async function transaction<T>(run: (db: Sql) => Promise<T>): Promise<T> {
  return runWithConnection(run, true);
}

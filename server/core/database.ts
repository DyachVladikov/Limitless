import { setDefaultResultOrder } from "node:dns";
import { Pool, types, type PoolClient } from "pg";
import { ApiError } from "./errors";
import { openLocalApi } from "./auth-config";
import { normalizeRow } from "./sql";
import type { Row, Sql } from "./types";

// macOS otherwise prefers IPv6 to the Supabase pooler and then hangs on ETIMEDOUT.
setDefaultResultOrder("ipv4first");

// Dates remain game-day strings; timestamptz is normalized to ISO at the boundary.
types.setTypeParser(1082, (value) => value);
let pool: Pool | undefined;
export function databasePool(): Pool {
  if (pool) return pool;
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
  pool = new Pool({
    connectionString: url.toString(),
    max: size,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 10000,
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
  pool.on("error", () => undefined);
  pool.on("connect", (client) => {
    client.on("error", () => undefined);
  });
  return pool;
}

function isTransientConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  return (
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "EPIPE" ||
    code === "CONNECTION_TIMEOUT" ||
    code === "57P01" ||
    code === "57P03" ||
    code === "55P03" ||
    code === "57014" ||
    message.includes("Connection terminated") ||
    message.includes("Query read timeout") ||
    message.includes("timeout expired") ||
    message.includes("canceling statement due to statement timeout")
  );
}

function databaseUnavailable(): ApiError {
  return new ApiError(
    503,
    "DATABASE_UNAVAILABLE",
    "База данных временно недоступна",
  );
}

function escapeLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return String(value);
  if (value instanceof Date) return `${escapeLiteral(value.toISOString())}::timestamptz`;
  if (typeof value === "object") return `${escapeLiteral(JSON.stringify(value))}::jsonb`;
  return escapeLiteral(String(value));
}

// Transaction-mode PgBouncer desyncs after node-pg's extended protocol ($1, $2).
function simpleQuery(sql: string, values: unknown[]): string {
  if (values.length === 0) return sql;
  return sql.replace(/\$(\d+)/g, (_, raw: string) => {
    const index = Number(raw) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= values.length) {
      throw new ApiError(500, "INTERNAL_ERROR", "Некорректный SQL-параметр");
    }
    return sqlLiteral(values[index]);
  });
}

function sqlFrom(connection: PoolClient): Sql {
  return {
    async query<R = Row>(sql: string, values: unknown[] = []) {
      const result = await connection.query(simpleQuery(sql, values));
      return {
        rows: result.rows.map(normalizeRow) as R[],
        rowCount: result.rowCount,
      };
    },
  };
}

export type TransactionRunner = <T>(run: (db: Sql) => Promise<T>) => Promise<T>;

export async function withDatabase<T>(run: (db: Sql) => Promise<T>): Promise<T> {
  const connection = await databasePool().connect();
  connection.on("error", () => undefined);
  let destroyed = false;
  try {
    return await run(sqlFrom(connection));
  } catch (error) {
    destroyed = true;
    connection.release(true);
    if (isTransientConnectionError(error)) throw databaseUnavailable();
    throw error;
  } finally {
    if (!destroyed) connection.release();
  }
}

export async function transaction<T>(run: (db: Sql) => Promise<T>): Promise<T> {
  // Transaction pooler (6543) never answers the query after BEGIN. Autocommit
  // statements on the same client are fine for this single-player app.
  return withDatabase(run);
}

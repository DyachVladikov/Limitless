export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ApiError';
  }
}

const databaseUnavailableCodes = new Set([
  'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'EPIPE',
  'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'ENETDOWN',
  'CONNECTION_TIMEOUT', 'ERR_SOCKET_CLOSED',
  '57P01', '57P02', '57P03', '57014', '55P03', '53300', '53400',
  'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'CERT_REVOKED',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
]);

function originalError(error: unknown): unknown {
  const seen = new Set<unknown>();
  while (error instanceof ApiError && error.cause !== undefined && !seen.has(error)) {
    seen.add(error);
    error = error.cause;
  }
  return error;
}

export function isDatabaseUnavailable(error: unknown): boolean {
  if (error instanceof ApiError && error.code === 'DATABASE_UNAVAILABLE') return true;
  const original = originalError(error);
  if (!original || typeof original !== 'object') return false;
  const code = 'code' in original ? String(original.code) : '';
  const message = 'message' in original ? String(original.message) : '';
  // Data errors may quote user input containing timeout words; their SQLSTATE takes precedence.
  if (/^(22|23)/.test(code) || code === '40001' || code === '40P01') return false;
  return databaseUnavailableCodes.has(code) || /^08[0-9A-Z]{3}$/.test(code) ||
    /^ERR_(TLS|SSL)_/.test(code) ||
    /timeout exceeded when trying to connect|timeout expired|connection terminated|query read timeout|canceling statement due to (statement|lock) timeout|client has encountered a connection error|socket hang up|self[- ]signed certificate|certificate has expired|unable to verify (the first certificate|leaf signature)/i.test(message);
}

function redactLog(value: string): string {
  let redacted = value.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[redacted database URL]');
  for (const key of ['DATABASE_URL', 'DATABASE_CA_CERT', 'PGPASSWORD', 'OWNER_PASSWORD_HASH', 'SESSION_SECRET', 'CRON_SECRET']) {
    const secret = process.env[key];
    if (secret) redacted = redacted.split(secret).join('[redacted]');
  }
  // PostgreSQL messages can quote rejected input values; neither those nor detail belong in logs.
  return redacted.replace(/"[^"\n]*"|'[^'\n]*'/g, '[redacted]').slice(0, 1000);
}

export function logServerError(context: string, error: unknown): void {
  const original = originalError(error);
  const source = original && typeof original === 'object' ? original : {};
  console.error(JSON.stringify({
    event: 'server_error',
    context: redactLog(context),
    name: 'name' in source ? redactLog(String(source.name)) : 'Error',
    code: 'code' in source ? redactLog(String(source.code)) : undefined,
    message: redactLog('message' in source ? String(source.message) : 'Unknown error'),
  }));
}

export function requireRow<T>(row: T | null | undefined, message = 'Запись не найдена'): T {
  if (row == null) throw new ApiError(404, 'NOT_FOUND', message);
  return row;
}

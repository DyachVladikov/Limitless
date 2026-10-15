import { allowedOrigins, openLocalApi } from './auth-config';
import { ApiError } from './errors';
import type { Row } from './types';

const MAX_BODY_BYTES = 64 * 1024;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALLOWED_METHODS = ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'];
const ALLOWED_HEADERS = ['Content-Type', 'X-Requested-With', 'Authorization'];

export function guardOrigin(request: Request): void {
  const origins = allowedOrigins();
  const origin = request.headers.get('origin');
  if (origin !== null && !origins.has(origin)) {
    throw new ApiError(403, 'ORIGIN_FORBIDDEN', 'Origin is not allowed');
  }
  if (origin === null && request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new ApiError(403, 'ORIGIN_FORBIDDEN', 'Cross-site request requires an allowed Origin');
  }
  if (SAFE_METHODS.has(request.method) || openLocalApi()) return;
  // This exemption only removes browser CSRF checks. The dispatcher still calls
  // requireJob, which independently authenticates the bearer credential.
  const cronRequest =
    new URL(request.url).pathname.replace(/\/$/, '') === '/api/jobs/rollover' &&
    /^Bearer \S+$/i.test(request.headers.get('authorization') ?? '');
  if (cronRequest) return;
  if (!origin || request.headers.get('x-requested-with') !== 'Limitless') {
    throw new ApiError(
      403,
      'CSRF_REJECTED',
      'An allowed Origin and X-Requested-With: Limitless are required',
    );
  }
}

export async function readBody(request: Request): Promise<Row> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) throw new ApiError(400, 'INVALID_BODY', 'Invalid request body');
    if (Number(contentLength) > MAX_BODY_BYTES)
      throw new ApiError(413, 'BODY_TOO_LARGE', 'Request body is too large');
  }
  if (!request.body) return {};
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json')
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ApiError(413, 'BODY_TOO_LARGE', 'Request body is too large');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'INVALID_BODY', 'Unable to read request body');
  } finally {
    reader.releaseLock();
  }
  try {
    const source = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes));
    const body: unknown = JSON.parse(source);
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error('Object required');
    return body as Row;
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Request body must be a valid JSON object');
  }
}

function responseHeaders(request: Request): Headers {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    Vary: 'Origin',
  });
  const origin = request.headers.get('origin');
  // Even malformed configuration must produce a safe error response. It must
  // never fall back to reflecting the request's Origin or to '*'.
  try {
    if (origin && allowedOrigins().has(origin)) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Credentials', 'true');
    }
  } catch {
    /* Fail closed: do not include CORS permission headers. */
  }
  return headers;
}

export function respond(request: Request, data: unknown, status = 200): Response {
  return new Response(status === 204 || request.method === 'HEAD' ? null : JSON.stringify(data), {
    status,
    headers: responseHeaders(request),
  });
}

export function respondError(request: Request, error: unknown): Response {
  let publicError: ApiError;
  if (error instanceof ApiError) {
    publicError = error;
  } else {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    switch (code) {
      case '23505':
      case '23503':
        publicError = new ApiError(409, 'CONFLICT', 'The operation conflicts with existing data');
        break;
      case '23514':
      case '23502':
      case '22P02':
      case '22003':
      case '22007':
      case '22008':
        publicError = new ApiError(400, 'INVALID_DATA', 'The provided data is invalid');
        break;
      case '40001':
      case '40P01':
        publicError = new ApiError(409, 'CONFLICT', 'Data changed concurrently; retry the request');
        break;
      default:
        publicError = new ApiError(500, 'INTERNAL_ERROR', 'An internal error occurred');
    }
  }
  const payload = {
    code: publicError.code,
    message: publicError.message,
    ...(publicError.details === undefined ? {} : { details: publicError.details }),
  };
  const response = respond(request, { error: payload }, publicError.status);
  if (publicError.status === 429) response.headers.set('Retry-After', '300');
  return response;
}

export function preflight(request: Request): Response {
  guardOrigin(request);
  const method = request.headers.get('access-control-request-method');
  const requestedHeaders = (request.headers.get('access-control-request-headers') ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (
    !request.headers.get('origin') ||
    !method ||
    !ALLOWED_METHODS.includes(method) ||
    requestedHeaders.some((header) => !ALLOWED_HEADERS.some((allowed) => allowed.toLowerCase() === header))
  ) {
    throw new ApiError(403, 'CORS_REJECTED', 'Preflight request is not allowed');
  }
  const response = respond(request, null, 204);
  response.headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS.join(', '));
  response.headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS.join(', '));
  response.headers.set('Access-Control-Max-Age', '600');
  response.headers.set('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
  return response;
}

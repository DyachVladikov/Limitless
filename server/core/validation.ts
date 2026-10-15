import { ApiError } from './errors';
import type { Row } from './types';
export const invalid = (name: string, message = 'Некорректное значение'): never => {
  throw new ApiError(400, 'VALIDATION_ERROR', `${name}: ${message}`, { field: name });
};
export function object(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return invalid('body', 'ожидается JSON-объект');
  return value as Row;
}
export function only(body: Row, allowed: readonly string[]): void {
  for (const key of Object.keys(body))
    if (!allowed.includes(key)) invalid(key, 'неизвестное или недоступное для изменения поле');
}
export function text(value: unknown, name: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    return invalid(name, `ожидается непустая строка до ${max} символов`);
  return value.trim();
}
export function optionalText(value: unknown, name: string, max = 500): string | null {
  if (value == null || value === '') return null;
  return text(value, name, max);
}
export function integer(value: unknown, name: string, min = 0, max = 2147483647): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    return invalid(name, `ожидается целое от ${min} до ${max}`);
  return value;
}
export function boolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') return invalid(name, 'ожидается boolean');
  return value;
}
export function uuid(value: unknown, name = 'id'): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  )
    return invalid(name, 'ожидается UUID');
  return value.toLowerCase();
}
export function date(value: unknown, name = 'gameDate'): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01')
    return invalid(name, 'ожидается дата YYYY-MM-DD');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    return invalid(name, 'несуществующая дата');
  return value;
}
export function choice<T extends string>(value: unknown, name: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T))
    return invalid(name, `допустимо: ${allowed.join(', ')}`);
  return value as T;
}
export function version(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) && BigInt(value) <= 9223372036854775807n)
    return value;
  return invalid('version', 'ожидается неотрицательная целая версия записи');
}
export function expectVersion(row: Row, expected: unknown): void {
  if (String(row.version) !== version(expected))
    throw new ApiError(409, 'VERSION_CONFLICT', 'Запись изменилась. Обнови данные перед повтором.', {
      currentVersion: String(row.version),
    });
}

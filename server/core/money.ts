import { ApiError } from './errors';
const MAX_CENTS = 99999999999999;
export function cents(value: unknown): number {
  const raw = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof raw !== 'string' || !/^-?\d+(\.\d{1,2})?$/.test(raw)) throw new ApiError(400, 'INVALID_AMOUNT', 'Ожидается число с максимум двумя десятичными знаками');
  const [whole, fraction = ''] = raw.replace(/^-/, '').split('.');
  const result = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
  if (!Number.isSafeInteger(result) || result > MAX_CENTS) throw new ApiError(400, 'INVALID_AMOUNT', 'Число вне диапазона XP');
  return raw.startsWith('-') ? -result : result;
}
export function amount(value: number): string {
  if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_CENTS) throw new ApiError(400, 'INVALID_AMOUNT', 'Некорректная сумма XP');
  const abs = Math.abs(value);
  return `${value < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

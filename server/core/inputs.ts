import { ApiError } from './errors';
import { one, requireRow } from './sql';
import { cents, amount } from './money';
import { date, integer } from './validation';
import type { GameContext, Row } from './types';

export function conflict(message: string): never {
  throw new ApiError(409, 'CONFLICT', message);
}

export function invalid(message: string): never {
  throw new ApiError(400, 'INVALID_INPUT', message);
}

export function decimal(value: unknown, name: string, max = 99999999.99): string {
  const valueCents = cents(value);
  if (valueCents < 0 || valueCents > Math.round(max * 100)) {
    invalid(`${name} is outside the permitted range`);
  }
  return amount(valueCents);
}

export function portions(value: unknown): string {
  const raw = String(value);
  if (!/^\d{1,5}(?:\.\d{1,3})?$/.test(raw) || Number(raw) <= 0) {
    invalid('portions must be positive with at most three decimal places');
  }
  return Number(raw).toFixed(3);
}

// Повтор POST с тем же ID допустим только с теми же данными.
export function sameValues(row: Row, data: Row): void {
  const numericFields = [
    'portions',
    'weight_kg',
    'calories_per_portion',
    'protein_per_portion',
    'fat_per_portion',
    'carbs_per_portion',
  ];
  for (const [key, value] of Object.entries(data)) {
    const actual = row[key];
    let same = String(actual) === String(value);
    if (value === null || typeof value === 'boolean') {
      same = actual === value;
    } else if (numericFields.includes(key)) {
      same = Number(actual) === Number(value);
    }
    if (!same) conflict('This ID already exists with different data');
  }
}

export function currentDate(ctx: GameContext, value: unknown): string {
  const day = date(value);
  if (day !== ctx.today || (ctx.profile.last_closed_day && day <= ctx.profile.last_closed_day)) {
    conflict('The requested game day is closed or is not today');
  }
  return day;
}

export function performedDate(ctx: GameContext, value: unknown): string {
  const day = date(value, 'performedOn');
  if (day > ctx.today) invalid('A workout cannot be dated in the future');
  return day;
}

export function pageLimit(query: URLSearchParams, fallback = 50): number {
  const limit = query.has('limit') ? Number(query.get('limit')) : fallback;
  return integer(limit, 'limit', 1, 100);
}

export function pageOffset(query: URLSearchParams): number {
  const offset = query.has('offset') ? Number(query.get('offset')) : 0;
  return integer(offset, 'offset', 0, 1000000);
}

export async function rowById(ctx: GameContext, table: string, id: string): Promise<Row> {
  const permitted = [
    'workout_programs',
    'exercises',
    'workouts',
    'nutrition_entries',
    'subjects',
    'lab_works',
    'books',
    'coding_tasks',
    'scenarios',
    'dishes',
  ];
  if (!permitted.includes(table)) throw new Error('Invalid table');
  return requireRow(await one(ctx.db, `SELECT * FROM ${table} WHERE id=$1`, [id]));
}

export async function counter(ctx: GameContext, key: string): Promise<void> {
  const counters = { ...ctx.profile.quest_counters };
  counters[key] = Number(counters[key] ?? 0) + 1;
  ctx.profile = requireRow(
    await one(ctx.db, 'UPDATE profiles SET quest_counters=$1 WHERE id=1 RETURNING *', [
      JSON.stringify(counters),
    ]),
  );
}

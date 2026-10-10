import { date } from './validation';
export function moscowDate(iso: string | Date): string {
  const value = new Date(iso);
  if (!Number.isFinite(value.getTime())) throw new Error('Invalid clock');
  return new Date(value.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function addDays(day: string, count: number): string {
  const value = new Date(`${date(day)}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}
export function weekday(day: string): number {
  return new Date(`${date(day)}T00:00:00.000Z`).getUTCDay() || 7;
}
export function inPeriods(periods: unknown, day: string): boolean {
  return Array.isArray(periods) && periods.some(period => period && period.startDate <= day && period.endDate >= day);
}

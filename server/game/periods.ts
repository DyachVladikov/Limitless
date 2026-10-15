import { ApiError } from '../core/errors';
import { date, object, only, optionalText } from '../core/validation';

type Period = { startDate: string; endDate: string; reason?: string };

export function normalizePeriods(value: unknown, field: string): Period[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new ApiError(400, 'INVALID_INPUT', `${field} must be an array of at most 100 periods`);
  }
  const allowed = ['startDate', 'endDate'];
  if (field === 'plannedAbsences') {
    allowed.push('reason');
  }
  const periods: Period[] = [];
  for (const entry of value) {
    const row = object(entry);
    only(row, allowed);
    const period: Period = {
      startDate: date(row.startDate, 'startDate'),
      endDate: date(row.endDate, 'endDate'),
    };
    if (period.endDate < period.startDate) {
      throw new ApiError(400, 'INVALID_INPUT', 'Period end precedes start');
    }
    if (row.reason !== undefined) {
      period.reason = optionalText(row.reason, 'reason', 500) ?? '';
    }
    periods.push(period);
  }
  periods.sort((left, right) => {
    return left.startDate.localeCompare(right.startDate) || left.endDate.localeCompare(right.endDate);
  });

  const merged: Period[] = [];
  for (const period of periods) {
    const previous = merged[merged.length - 1];
    if (!previous || period.startDate > previous.endDate) {
      merged.push({ ...period });
      continue;
    }
    if (period.endDate > previous.endDate) {
      previous.endDate = period.endDate;
    }
    if (period.reason && period.reason !== previous.reason) {
      previous.reason = [previous.reason, period.reason].filter(Boolean).join('; ');
    }
  }
  return merged;
}

export function assertPeriodsUnchanged(previous: Period[], next: Period[], today: string): void {
  const fixedPrevious = previous.filter((period) => period.startDate <= today);
  const fixedNext = next.filter((period) => period.startDate <= today);
  // Начавшиеся периоды неизменяемы: иначе можно задним числом убрать штрафы и пропуски.
  if (JSON.stringify(fixedPrevious) !== JSON.stringify(fixedNext)) {
    throw new ApiError(
      409,
      'PAST_PERIOD',
      'Existing periods through today are immutable; new periods must start tomorrow',
    );
  }
}

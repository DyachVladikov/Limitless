import type { GameContext, Row, Sql } from '../../core/types';
import { ApiError } from '../../core/errors';
import { all, insert } from '../../core/sql';
import { only, text, optionalText, integer, date, object, expectVersion } from '../../core/validation';
import { cents, amount } from '../../core/money';
import { moscowDate } from '../../core/dates';
import { saveProfile, profileView } from './effects';

const fields = ['name','avatarUrl','title','trainingDays','studyDays','studyBreaks','plannedAbsences','nutritionGoals'];
type Period = { startDate: string; endDate: string; reason?: string };
function periods(value: unknown, name: string): Period[] {
  if (!Array.isArray(value) || value.length > 100) throw new ApiError(400,'INVALID_INPUT', `${name} must be an array of at most 100 periods`);
  const list = value.map(p => {
    const row = object(p);
    only(row, name === 'plannedAbsences' ? ['startDate','endDate','reason'] : ['startDate','endDate']);
    const result: Period = { startDate: date(row.startDate,'startDate'), endDate: date(row.endDate,'endDate') };
    if (result.endDate < result.startDate) throw new ApiError(400,'INVALID_INPUT','Period end precedes start');
    if (row.reason !== undefined) result.reason = optionalText(row.reason,'reason',500) ?? '';
    return result;
  }).sort((a,b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));
  const normalized: Period[] = [];
  for (const period of list) {
    const previous = normalized[normalized.length-1];
    if (previous && period.startDate <= previous.endDate) {
      previous.endDate = previous.endDate > period.endDate ? previous.endDate : period.endDate;
      if (period.reason && period.reason !== previous.reason) previous.reason = [previous.reason, period.reason].filter(Boolean).join('; ');
    } else normalized.push({ ...period });
  }
  return normalized;
}
function weekdays(value: unknown, name: string): number[] {
  if (!Array.isArray(value) || value.length > 7) throw new ApiError(400,'INVALID_INPUT',`${name} must contain weekdays 1–7`);
  const days = value.map(v => integer(v,name,1,7));
  if (new Set(days).size !== days.length) throw new ApiError(400,'INVALID_INPUT',`${name} must not contain duplicates`);
  return days.sort();
}
function settings(body: Row, today: string, previous?: Row): Row {
  const patch: Row = {};
  if ('name' in body) patch.name = text(body.name,'name',100);
  if ('avatarUrl' in body) patch.avatar_url = optionalText(body.avatarUrl,'avatarUrl',2048);
  if ('title' in body) patch.title = optionalText(body.title,'title',200);
  for (const [input,column] of [['trainingDays','training_days'],['studyDays','study_days']] as const) {
    if (input in body) patch[column] = weekdays(body[input],input);
  }
  for (const [input,column] of [['studyBreaks','study_breaks'],['plannedAbsences','planned_absences']] as const) {
    if (!(input in body)) continue;
    const next = periods(body[input],input);
    const old: Period[] = previous?.[column] ?? [];
    const fixedOld = old.filter(p => p.startDate <= today);
    const fixedNext = next.filter(p => p.startDate <= today);
    // Existing and elapsed intervals cannot be rewritten, and new absences begin tomorrow.
    if (input === 'plannedAbsences' || previous) {
      if (JSON.stringify(fixedOld) !== JSON.stringify(fixedNext)) {
        throw new ApiError(409,'PAST_PERIOD','Existing periods through today are immutable; new periods must start tomorrow');
      }
    }
    patch[column] = next;
  }
  if ('nutritionGoals' in body) {
    const keys = ['calories','protein','fat','carbs'];
    const goals = body.nutritionGoals === null ? null : object(body.nutritionGoals);
    if (goals) only(goals,keys);
    for (const key of keys) {
      let value = null;
      if (goals) {
        const n = cents(goals[key]);
        if (n <= 0 || n > 9999999999) throw new ApiError(400,'INVALID_INPUT',`nutritionGoals.${key} must be positive and below 100000000`);
        value = amount(n);
      }
      patch[`nutrition_goal_${key}`] = value;
    }
  }
  return patch;
}
export async function createProfile(db: Sql, body: Row, now: string): Promise<Row> {
  only(body,fields);
  const name = text(body.name,'name',100);
  if ((await all(db,'SELECT id FROM profiles')).length) throw new ApiError(409,'PROFILE_EXISTS','Profile already exists');
  return insert(db,'profiles',{ id:1, name, ...settings(body,moscowDate(now)), created_at: now });
}
export async function editProfile(ctx: GameContext, body: Row): Promise<Row> {
  only(body,[...fields,'version']);
  expectVersion(ctx.profile,body.version);
  await saveProfile(ctx,settings(body,ctx.today,ctx.profile));
  return profileView(ctx.profile);
}

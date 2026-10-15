import { moscowDate } from '../core/dates';
import { ApiError } from '../core/errors';
import { amount, cents } from '../core/money';
import { insert, one } from '../core/sql';
import type { GameContext, Row, Sql } from '../core/types';
import { expectVersion, integer, object, only, optionalText, text } from '../core/validation';
import { profileView, saveProfile } from './effects';
import { assertPeriodsUnchanged, normalizePeriods } from './periods';

const settingsFields = [
  'name',
  'avatarUrl',
  'title',
  'trainingDays',
  'studyDays',
  'studyBreaks',
  'plannedAbsences',
  'nutritionGoals',
];

function weekdays(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.length > 7) {
    throw new ApiError(400, 'INVALID_INPUT', `${field} must contain weekdays 1–7`);
  }
  const days = value.map((day) => integer(day, field, 1, 7));
  if (new Set(days).size !== days.length) {
    throw new ApiError(400, 'INVALID_INPUT', `${field} must not contain duplicates`);
  }
  return days.sort((left, right) => left - right);
}

function settingsPatch(body: Row, today: string, previous?: Row): Row {
  const patch: Row = {};
  if ('name' in body) {
    patch.name = text(body.name, 'name', 100);
  }
  if ('avatarUrl' in body) {
    patch.avatar_url = optionalText(body.avatarUrl, 'avatarUrl', 2048);
  }
  if ('title' in body) {
    patch.title = optionalText(body.title, 'title', 200);
  }
  if ('trainingDays' in body) {
    patch.training_days = weekdays(body.trainingDays, 'trainingDays');
  }
  if ('studyDays' in body) {
    patch.study_days = weekdays(body.studyDays, 'studyDays');
  }

  if ('studyBreaks' in body) {
    const periods = normalizePeriods(body.studyBreaks, 'studyBreaks');
    if (previous) {
      assertPeriodsUnchanged(previous.study_breaks, periods, today);
    }
    patch.study_breaks = periods;
  }
  if ('plannedAbsences' in body) {
    const periods = normalizePeriods(body.plannedAbsences, 'plannedAbsences');
    assertPeriodsUnchanged(previous?.planned_absences ?? [], periods, today);
    patch.planned_absences = periods;
  }

  if ('nutritionGoals' in body) {
    const keys = ['calories', 'protein', 'fat', 'carbs'];
    let goals: Row | null = null;
    if (body.nutritionGoals !== null) {
      goals = object(body.nutritionGoals);
      only(goals, keys);
    }
    for (const key of keys) {
      patch[`nutrition_goal_${key}`] = null;
      if (!goals) {
        continue;
      }
      const value = cents(goals[key]);
      if (value <= 0 || value > 9999999999) {
        throw new ApiError(
          400,
          'INVALID_INPUT',
          `nutritionGoals.${key} must be positive and below 100000000`,
        );
      }
      patch[`nutrition_goal_${key}`] = amount(value);
    }
  }
  return patch;
}

export async function createProfile(db: Sql, body: Row, now: string): Promise<Row> {
  only(body, settingsFields);
  const name = text(body.name, 'name', 100);
  const existing = await one(db, 'SELECT id FROM profiles');
  if (existing) {
    throw new ApiError(409, 'PROFILE_EXISTS', 'Profile already exists');
  }
  return insert(db, 'profiles', {
    id: 1,
    name,
    ...settingsPatch(body, moscowDate(now)),
    created_at: now,
  });
}

export async function editProfile(ctx: GameContext, body: Row): Promise<Row> {
  only(body, [...settingsFields, 'version']);
  expectVersion(ctx.profile, body.version);
  await saveProfile(ctx, settingsPatch(body, ctx.today, ctx.profile));
  return profileView(ctx.profile);
}

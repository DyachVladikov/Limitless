import { one, requireRow } from '../core/sql';
import type { GameContext, Row } from '../core/types';
import { saveProfile } from './effects';

export async function metrics(ctx: GameContext): Promise<Record<string, number>> {
  const stored = requireRow<Row>(
    await one<Row>(
      ctx.db,
      `
    SELECT
      (SELECT count(*) FROM books WHERE completed_at IS NOT NULL) AS books_read,
      (SELECT coalesce(sum(read_units), 0) FROM books WHERE progress_unit = 'pages') AS pages_read,
      (SELECT coalesce(sum(read_units), 0) FROM books WHERE progress_unit = 'chapters') AS chapters_read,
      (SELECT coalesce(sum(duration_seconds), 0) FROM focus_sessions) AS focus_seconds,
      (SELECT count(*) FROM workouts WHERE kind = 'gym' AND attended) AS gym_workouts,
      (SELECT count(*) FROM workouts WHERE kind = 'volleyball' AND attended) AS volleyball_attendances,
      (SELECT count(*) FROM lab_works WHERE done_at IS NOT NULL) AS lab_works_done,
      (SELECT count(*) FROM lab_works WHERE passed_at IS NOT NULL) AS lab_works_passed,
      (SELECT count(*) FROM subjects WHERE closed_at IS NOT NULL) AS subjects_closed
  `,
    ),
  );

  // Эти факты переживают очистку текущих назначений и хранятся счётчиками.
  const facts: Record<string, number> = {};
  const counters = [
    'daily_tasks_completed',
    'daily_sets_completed',
    'coding_tasks_solved',
    'scenarios_completed',
  ];
  for (const key of counters) {
    facts[key] = Number(ctx.profile.quest_counters[key] ?? 0);
  }
  for (const [key, value] of Object.entries(stored)) {
    facts[key] = Number(value);
  }
  return facts;
}

export async function incrementCounter(ctx: GameContext, key: string, change: number): Promise<void> {
  const counters = { ...ctx.profile.quest_counters };
  counters[key] = Math.max(0, Number(counters[key] ?? 0) + change);
  await saveProfile(ctx, { quest_counters: counters });
}

export async function settleDailySet(ctx: GameContext): Promise<void> {
  const counts = requireRow<Row>(
    await one<Row>(
      ctx.db,
      `
    SELECT count(*) AS total, count(completed_at) AS completed
    FROM tasks WHERE assigned_for = $1
  `,
      [ctx.today],
    ),
  );
  const complete = Number(counts.total) === 5 && Number(counts.completed) === 5;
  if (complete === Boolean(ctx.profile.daily_set_completed_at)) {
    return;
  }

  if (complete) {
    await saveProfile(ctx, { daily_set_completed_at: ctx.now });
    await incrementCounter(ctx, 'daily_sets_completed', 1);
  } else {
    await saveProfile(ctx, { daily_set_completed_at: null });
    await incrementCounter(ctx, 'daily_sets_completed', -1);
  }
}

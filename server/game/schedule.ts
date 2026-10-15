import { randomUUID } from 'node:crypto';
import { addDays, inPeriods, weekday } from '../core/dates';
import { all, update } from '../core/sql';
import type { GameContext, Row } from '../core/types';

export async function issueDailies(ctx: GameContext): Promise<void> {
  if (inPeriods(ctx.profile.planned_absences, ctx.today)) {
    return;
  }

  const dayOfWeek = weekday(ctx.today);
  const trainingDay = ctx.profile.training_days.includes(dayOfWeek);
  const studyDay = ctx.profile.study_days.includes(dayOfWeek);
  const studyBreak = inPeriods(ctx.profile.study_breaks, ctx.today);
  const eligible = await all(
    ctx.db,
    `
    SELECT t.* FROM tasks t
    WHERE t.is_enabled AND t.assignment_id IS NULL
      AND (t.next_available_on IS NULL OR t.next_available_on <= $1)
      AND (NOT coalesce((t.availability->>'trainingDayOnly')::boolean, false) OR $2)
      AND (NOT coalesce((t.availability->>'studyDayOnly')::boolean, false) OR $3)
      AND (NOT coalesce((t.availability->>'excludeStudyBreaks')::boolean, false) OR NOT $4)
      AND (
        t.availability->>'requiredStudyAction' IS NULL
        OR (t.availability->>'requiredStudyAction' = 'lab_done' AND EXISTS (
          SELECT 1 FROM lab_works l JOIN subjects s ON s.id = l.subject_id
          WHERE NOT s.is_archived AND s.closed_at IS NULL AND l.done_at IS NULL
        ))
        OR (t.availability->>'requiredStudyAction' = 'lab_passed' AND EXISTS (
          SELECT 1 FROM lab_works l JOIN subjects s ON s.id = l.subject_id
          WHERE NOT s.is_archived AND s.closed_at IS NULL
            AND l.done_at IS NOT NULL AND l.passed_at IS NULL
        ))
        OR (t.availability->>'requiredStudyAction' = 'subject_closed' AND EXISTS (
          SELECT 1 FROM subjects s WHERE NOT s.is_archived AND s.closed_at IS NULL
        ))
      )
    ORDER BY random()
  `,
    [ctx.today, trainingDay, studyDay, studyBreak],
  );

  // Сначала берём разные категории, затем заполняем оставшиеся места.
  const selected: Row[] = [];
  const categories = new Set<string>();
  const selectedIds = new Set<string>();
  for (const task of eligible) {
    if (selected.length === 5) {
      break;
    }
    if (categories.has(task.category)) {
      continue;
    }
    selected.push(task);
    categories.add(task.category);
    selectedIds.add(task.id);
  }
  for (const task of eligible) {
    if (selected.length === 5) {
      break;
    }
    if (selectedIds.has(task.id)) {
      continue;
    }
    selected.push(task);
    selectedIds.add(task.id);
  }

  for (const task of selected) {
    await update(
      ctx.db,
      'tasks',
      { id: task.id },
      {
        assignment_id: randomUUID(),
        assigned_for: ctx.today,
        next_available_on: addDays(ctx.today, task.cooldown_days),
        assigned_effects: {
          reward: { xp: Number(task.reward_xp), stats: task.reward_stats },
          penalty: { xp: Number(task.penalty_xp), stats: task.penalty_stats },
        },
      },
    );
  }
}

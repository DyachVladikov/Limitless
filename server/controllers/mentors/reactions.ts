import type { GameContext, GameEvent, Row } from '../../core/types';
import { all, one } from '../../core/sql';
import { BALANCE } from '../../config/balance';
import { hasPhrase, mentorRandom, pick, reaction } from './content';

const { popupChance, ownSectionChance, popupCooldownMinutes } = BALANCE.mentors;
const popupCooldownMs = popupCooldownMinutes * 60 * 1000;

function rankReaction(event: GameEvent, mentors: Row[], rng: () => number): void {
  const mentor = mentors.find((candidate) => candidate.id === 'gojo');
  if (!mentor) {
    return;
  }
  const phrase = reaction(mentor, event.type, rng);
  if (phrase) {
    event.mentor = phrase;
  }
}

function questReaction(event: GameEvent, mentors: Row[], rng: () => number): void {
  const candidates = mentors.filter((mentor) => hasPhrase(mentor, 'quest_completed'));
  const mentor = candidates.find((candidate) => candidate.id === 'gojo') ?? pick(candidates, rng);
  if (mentor) {
    event.mentor = reaction(mentor, 'quest_completed', rng);
  }
}

function workoutReminder(event: GameEvent, mentors: Row[], rng: () => number): void {
  const candidates = mentors.filter(
    (mentor) => mentor.section === 'sport' && hasPhrase(mentor, 'workout_results_reminder'),
  );
  const mentor = pick(candidates, rng);
  if (mentor) {
    event.reminder = {
      ...reaction(mentor, 'workout_results_reminder', rng),
      href: '/do-it',
    };
  }
}

function dailyPopup(mentors: Row[], section: string | undefined, rng: () => number): Row | null {
  const ownSection = rng() < ownSectionChance;
  const eventName = ownSection ? 'daily_completed' : 'cross_reaction';
  const candidates = mentors.filter((mentor) => {
    const matchesSection = ownSection ? mentor.section === section : mentor.section !== section;
    return matchesSection && hasPhrase(mentor, eventName);
  });
  const mentor = pick(candidates, rng);
  if (!mentor) {
    return null;
  }
  return reaction(mentor, eventName, rng);
}

export async function mentorReactions(ctx: GameContext, rng: () => number = mentorRandom): Promise<void> {
  if (ctx.events.length === 0) {
    return;
  }
  const mentors = await all(ctx.db, 'SELECT * FROM mentors ORDER BY id');
  let offered = false;
  for (const event of ctx.events) {
    // Обязательные реплики ранга и квестов обходят вероятность и кулдаун.
    if (event.type === 'rank_up' || event.type === 'rank_down') {
      rankReaction(event, mentors, rng);
      continue;
    }
    if (event.type === 'quest_completed') {
      questReaction(event, mentors, rng);
      continue;
    }
    if (event.type !== 'daily_completed') {
      continue;
    }

    const task = await one(ctx.db, 'SELECT category, completion_action FROM tasks WHERE id = $1', [
      event.taskId,
    ]);
    if (task?.completion_action === 'log_gym_results') {
      workoutReminder(event, mentors, rng);
    }

    const lastShown = ctx.profile.last_mentor_popup_at;
    const coolingDown = lastShown && Date.parse(ctx.now) - Date.parse(lastShown) < popupCooldownMs;
    if (offered || coolingDown || rng() >= popupChance) {
      continue;
    }
    const section = task?.category === 'health' ? 'nutrition' : task?.category;
    const popup = dailyPopup(mentors, section, rng);
    if (popup) {
      event.mentor_popup = popup;
      // Само предложение не запускает кулдаун: нужен отдельный popup/seen.
      offered = true;
    }
  }
}

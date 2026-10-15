import type { GameContext, Input, Row } from '../core/types';
import { all, update } from '../core/sql';
import { choice, expectVersion, only } from '../core/validation';
import { hasPhrase, mentorRandom, pick, reaction } from './mentors/content';

export async function listMentors(ctx: GameContext): Promise<Row[]> {
  return all(ctx.db, 'SELECT * FROM mentors ORDER BY section, id');
}

export async function getPageMentor(ctx: GameContext, { query }: Input): Promise<Row | null> {
  const section = choice(query.get('section'), 'section', [
    'home',
    'study',
    'sport',
    'work',
    'nutrition',
    'rationality',
  ]);
  const mentors = await all(ctx.db, 'SELECT * FROM mentors WHERE section = $1 ORDER BY id', [section]);
  const mentor = pick(
    mentors.filter((candidate) => hasPhrase(candidate, 'idle')),
    mentorRandom,
  );
  if (!mentor) {
    return null;
  }
  return reaction(mentor, 'idle', mentorRandom);
}

export async function markMentorPopupSeen(ctx: GameContext, { body }: Input): Promise<Row> {
  only(body, ['version']);
  expectVersion(ctx.profile, body.version);
  ctx.profile = await update(
    ctx.db,
    'profiles',
    { id: 1 },
    {
      last_mentor_popup_at: ctx.now,
    },
  );
  return {
    last_mentor_popup_at: ctx.profile.last_mentor_popup_at,
    version: ctx.profile.version,
  };
}

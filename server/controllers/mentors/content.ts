import { randomInt } from 'node:crypto';
import type { Row } from '../../core/types';

export function mentorRandom(): number {
  return randomInt(1_000_000) / 1_000_000;
}

export function pick<T>(values: T[], rng: () => number): T | undefined {
  const index = Math.min(values.length - 1, Math.floor(rng() * values.length));
  return values[index];
}

export function hasPhrase(mentor: Row, event: string): boolean {
  return mentor.phrases.some((phrase: Row) => phrase.event === event);
}

export function reaction(mentor: Row, event: string, rng: () => number): Row | null {
  const phrases = mentor.phrases.filter((phrase: Row) => phrase.event === event);
  const phrase = pick<Row>(phrases, rng);
  if (!phrase) {
    return null;
  }
  return {
    mentor_id: mentor.id,
    name: mentor.name,
    phrase_id: phrase.id,
    event,
    mood: phrase.mood,
    text: phrase.text,
    image: mentor.images[phrase.mood] ?? mentor.images.default,
  };
}

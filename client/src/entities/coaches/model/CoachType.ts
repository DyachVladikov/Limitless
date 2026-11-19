type MentorSection =
  "home" | "study" | "sport" | "work" | "nutrition" | "rationality";

type MentorMood = "positive" | "negative" | "neutral";

type MentorPhraseEvent =
  | "idle"
  | "daily_completed"
  | "quest_completed"
  | "rank_up"
  | "rank_down"
  | "cross_reaction"
  | "workout_results_reminder";

type MentorImages = {
  default: string;
  positive?: string;
  negative?: string;
  neutral?: string;
};

type MentorPhrase = {
  id: string;
  event: MentorPhraseEvent;
  mood: MentorMood;
  text: string;
};

export type MentorType = {
  id: string;
  name: string;
  section: MentorSection;
  images: MentorImages;
  phrases: MentorPhrase[];
  createdAt: string;
  updatedAt: string;
  version: string;
};

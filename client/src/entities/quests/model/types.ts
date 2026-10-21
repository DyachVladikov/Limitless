export type Quests = {
  id: string;
  title: string;
  description: string;
  icon: string | null;
  rewardXp: number;
  targetCount: number;
  progress: number;
  completedAt: string | null;
};

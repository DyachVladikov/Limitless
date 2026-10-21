export type DailyTask = {
  id: string;
  title: string;
  description: string;
  icon: string | null;
  category: "study" | "sport" | "health" | "work" | "rationality";
  rewardXp: number;
  assignmentId: string | null;
  assignedFor: string | null;
  completedAt: string | null;
  version: string;
};

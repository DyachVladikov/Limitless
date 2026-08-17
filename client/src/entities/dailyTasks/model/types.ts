export type DailyTask = {
  id: string;
  title: string;
  description: string;
  icon: string;
  exp: number;
  category: "study" | "sport" | "health" | "work" | "rationality";
  isCompleted: boolean;
};

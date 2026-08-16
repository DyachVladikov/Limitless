export type User = {
  id: string;
  name: string;
  rank: ranks;
  exp: number;
  stats: stats;
  streak: number;
  level: level;
  lastActiveDate: string;
  createdAt: string;
};
type ranks = "E" | "D" | "C" | "B" | "A" | "S" | "S+" | "SS" | "SSS";
type stats = {
  statRationality: number;
  statIntelligence: number;
  statEgo: number;
  statStrength: number;
  statEnergy: number;
  statDiscipline: number;
};

type level = {
  currentExp: number;
  expToNextLevel: number;
  totalExp: number;
};

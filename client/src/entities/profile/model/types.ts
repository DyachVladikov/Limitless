type Rank = "E" | "D" | "C" | "B" | "A" | "S" | "S+" | "SS" | "SSS";

type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type StatKey =
  | "statIntelligence"
  | "statStrength"
  | "statRationality"
  | "statEgo"
  | "statDiscipline"
  | "statEnergy";

type DateRange = {
  startDate: string;
  endDate: string;
};

type AbsencePeriod = DateRange & {
  reason?: string;
};

type DayActivitySnapshot = {
  streak: number;
  lastActiveDate: string | null;
};

type QuestCounters = {
  dailyTasksCompleted?: number;
  dailySetsCompleted?: number;
  codingTasksSolved?: number;
  scenariosCompleted?: number;
};

type NutritionGoals = {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

type PendingRankChange = {
  id: string;
  fromRank: Rank;
  toRank: Rank;
  changedAt: string;
};

export type Profile = {
  id: 1;
  name: string;
  avatarUrl: string | null;
  title: string | null;
  timezone: string;
  trainingDays: Weekday[];
  studyDays: Weekday[];
  studyBreaks: DateRange[];
  plannedAbsences: AbsencePeriod[];
  totalExp: number;
  highestRank: Rank;
  statIntelligence: number;
  statStrength: number;
  statRationality: number;
  statEgo: number;
  statDiscipline: number;
  statEnergy: number;
  loginStreak: number;
  activityStreak: number;
  lastLoginDate: string | null;
  lastActivityDate: string | null;
  dayActivitySnapshot: DayActivitySnapshot | null;
  currentDay: string | null;
  lastClosedDay: string | null;
  dailySetCompletedAt: string | null;
  questCounters: QuestCounters;
  nutritionGoalCalories: number | null;
  nutritionGoalProtein: number | null;
  nutritionGoalFat: number | null;
  nutritionGoalCarbs: number | null;
  dayNutritionGoals: NutritionGoals | null;
  dayBalanceVersion: string | null;
  lastMentorPopupAt: string | null;
  pendingRankChange: PendingRankChange | null;
  createdAt: string;
  updatedAt: string;
  version: string;
  rank: Rank;
  level: number;
  levelExp: number;
  nextLevelExp: number;
  nextRank: Rank | null;
  nextRankExp: number | null;
  balanceVersion: string;
  statStages: number[];
};

export type ProfileStats = Pick<Profile, StatKey>;

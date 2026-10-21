import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { StatKey, User } from "./types";

const initialState: User = {
  id: 1,
  name: "User",
  avatarUrl: null,
  title: null,
  timezone: "Europe/Moscow",
  trainingDays: [],
  studyDays: [],
  studyBreaks: [],
  plannedAbsences: [],
  totalExp: 0,
  highestRank: "E",
  statIntelligence: 0,
  statStrength: 0,
  statRationality: 0,
  statEgo: 0,
  statDiscipline: 0,
  statEnergy: 0,
  loginStreak: 0,
  activityStreak: 0,
  lastLoginDate: null,
  lastActivityDate: null,
  dayActivitySnapshot: null,
  currentDay: null,
  lastClosedDay: null,
  dailySetCompletedAt: null,
  questCounters: {},
  nutritionGoalCalories: null,
  nutritionGoalProtein: null,
  nutritionGoalFat: null,
  nutritionGoalCarbs: null,
  dayNutritionGoals: null,
  dayBalanceVersion: null,
  lastMentorPopupAt: null,
  pendingRankChange: null,
  createdAt: "",
  updatedAt: "",
  version: "0",
  rank: "E",
  level: 1,
  levelExp: 0,
  nextLevelExp: 100,
  nextRank: "D",
  nextRankExp: 500,
  balanceVersion: "2026-10-10-v1",
  statStages: [0, 100, 1000, 5000],
};

export const UserSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    addStatExp: (
      state,
      action: PayloadAction<{ stat: StatKey; amount: number }>,
    ) => {
      const { stat, amount } = action.payload;
      state[stat] += amount;
      state.totalExp += amount;
    },
  },
});

export const { addStatExp } = UserSlice.actions;

export default UserSlice.reducer;

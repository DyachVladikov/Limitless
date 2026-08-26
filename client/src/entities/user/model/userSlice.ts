import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { User } from "./types";

const initialState: User = {
  id: "",
  name: "User",
  rank: "E",
  exp: 10,
  stats: {
    statRationality: 90,
    statIntelligence: 40,
    statEgo: 20,
    statStrength: 60,
    statEnergy: 10,
    statDiscipline: 70,
  },
  streak: 0,
  level: {
    currentLevel: 1,
    currentExp: 0,
    expToNextLevel: 100,
    totalExp: 0,
  },
  lastActiveDate: "",
  createdAt: "",
};

export const UserSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    addStatExp: (
      state,
      action: PayloadAction<{ stat: keyof User["stats"]; amount: number }>,
    ) => {
      const { stat, amount } = action.payload;
      state.stats[stat] += amount;
      state.exp += amount;
    },
  },
});

export const { addStatExp } = UserSlice.actions;

export default UserSlice.reducer;

import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { FocusModal } from "./types";

const initialState: FocusModal = {
  isOpen: false,
  isActive: false,
  startTime: null,
  accumulatedSeconds: 0,
};

export const FocusModalSlice = createSlice({
  name: "focus-modal",
  initialState,
  reducers: {
    toggleTimer: (state) => {
      if (state.isActive) {
        const now = Date.now();
        const elapsed = Math.floor((now - state.startTime!) / 1000);
        state.accumulatedSeconds += elapsed;
        state.isActive = false;
        state.startTime = null;
      } else {
        state.isActive = true;
        state.startTime = Date.now();
      }
    },
    resetTimer: (state) => {
      state.isActive = false;
      state.startTime = null;
      state.accumulatedSeconds = 0;
    },
    sendTimer: (state, { payload }: PayloadAction<boolean>) => {
      state.isOpen = false;
      if (payload) {
        state.isActive = false;
        state.startTime = null;
        state.accumulatedSeconds = 0;
      }
    },
  },
});

export const { toggleTimer, resetTimer, sendTimer } = FocusModalSlice.actions;

export default FocusModalSlice.reducer;

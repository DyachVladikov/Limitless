import { createSlice } from "@reduxjs/toolkit";
import { CoachModal } from "./types";

const initialState: CoachModal = {
  coach: null,
  isOpen: false,
};

export const coachModalSlice = createSlice({
  name: "coachModal",
  initialState,
  reducers: {
    openModal: (state) => {
      state.isOpen = true;
    },
    closeModal: (state) => {
      state.isOpen = false;
    },
  },
});

export const { openModal, closeModal } = coachModalSlice.actions;
export const coachModalReducer = coachModalSlice.reducer;

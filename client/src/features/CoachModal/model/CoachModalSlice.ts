import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { CoachModal } from "./types";
import { MentorType } from "@/entities/coaches";

const initialState: CoachModal = {
  popup: null,
  isOpen: false,
};

export const coachModalSlice = createSlice({
  name: "coachModal",
  initialState,
  reducers: {
    openModal: (state, action: PayloadAction<MentorType>) => {
      state.isOpen = true;
      state.popup = action.payload;
    },
    closeModal: (state) => {
      state.isOpen = false;
    },
  },
});

export const { openModal, closeModal } = coachModalSlice.actions;
export const coachModalReducer = coachModalSlice.reducer;

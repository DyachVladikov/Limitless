import { coachModalReducer } from "@/features/CoachModal/model/CoachModalSlice";
import focusModalReducer from "@/features/focusModal/model/FocusModalSlice";
import { configureStore } from "@reduxjs/toolkit";

export const store = configureStore({
  reducer: {
    focusModal: focusModalReducer,
    coachModal: coachModalReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;

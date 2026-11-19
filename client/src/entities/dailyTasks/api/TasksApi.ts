"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/axios";
import { store } from "@/app/store";
import { coachModalSlice } from "@/features/CoachModal/model/CoachModalSlice";
import type { DailyTask } from "../model/types";

const { openModal } = coachModalSlice.actions;

type TodayTasks = {
  gameDate: string;
  absent: boolean;
  tasks: DailyTask[];
};

export function useTodayTasks() {
  const { data, isLoading } = useQuery({
    queryKey: ["todayTasks"],
    queryFn: async () => {
      const { data } = await api.get<TodayTasks>("tasks/today");
      return data.tasks;
    },
  });

  return { data, isLoading };
}

export function useToggleTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (task: DailyTask) =>
      api.patch(`tasks/today/${task.id}`, {
        assignmentId: task.assignmentId,
        version: task.version,
        completed: !task.completedAt,
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["todayTasks"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });

      const focusIsRunning = store.getState().focusModal.isActive;
      if (focusIsRunning) {
        return;
      }

      const dailyEvent = response.events?.find((event) => event.mentorPopup);
      const mentorPopup = dailyEvent?.mentorPopup;
      const profileVersion = response.profile?.version;
      if (!mentorPopup || !profileVersion) {
        return;
      }

      store.dispatch(
        openModal({
          name: mentorPopup.name,
          text: mentorPopup.text,
          image: mentorPopup.image,
          profileVersion,
        }),
      );
    },
  });
}

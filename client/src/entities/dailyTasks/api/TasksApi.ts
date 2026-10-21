"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/axios";
import type { DailyTask } from "../model/types";

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todayTasks"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

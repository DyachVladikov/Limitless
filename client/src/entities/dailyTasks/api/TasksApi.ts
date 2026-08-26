"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/axios";

export interface DailyTask {
  id: string;
  title: string;
  description: string;
  icon: string;
  exp: number;
  category: "study" | "sport" | "health" | "work" | "rationality";
  isCompleted: boolean;
}

export function useTodayTasks() {
  const { data, isLoading } = useQuery({
    queryKey: ["todayTasks"],
    queryFn: () => api.get<DailyTask[]>("tasks/today").then((res) => res.data),
  });

  return { data, isLoading };
}

export function useToggleTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (task: DailyTask) =>
      api.patch(`tasks/today/${task.id}`, { isCompleted: !task.isCompleted }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todayTasks"] });
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });
}

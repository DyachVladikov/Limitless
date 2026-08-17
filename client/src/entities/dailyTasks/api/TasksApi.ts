"use client";

import { useQuery } from "@tanstack/react-query";
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

export function TasksApi() {
  const { data, isLoading } = useQuery({
    queryKey: ["todayTasks"],
    queryFn: () => api.get<DailyTask[]>("tasks/today").then((res) => res.data),
  });

  return { data, isLoading };
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/axios";
import type { Quests } from "../model/types";

export function useQuests() {
  const { data, isLoading } = useQuery({
    queryKey: ["quests"],
    queryFn: () => api.get<Quests[]>("quests").then((res) => res.data),
  });

  return { data, isLoading };
}

export function useClosestQuests(limit = 3) {
  const { data, isLoading } = useQuery({
    queryKey: ["quests", "closest", limit],
    queryFn: () =>
      api.get<Quests[]>(`quests?limit=${limit}`).then((res) => res.data),
  });

  return { data, isLoading };
}

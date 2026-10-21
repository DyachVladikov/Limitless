"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/axios";
import type { Quests } from "../model/types";

export function useQuests() {
  const { data, isLoading } = useQuery({
    queryKey: ["quests"],
    queryFn: async () => {
      const { data } = await api.get<Quests[]>("quests");
      return data;
    },
  });

  return { data, isLoading };
}

export function useClosestQuests(limit = 3) {
  const { data, isLoading } = useQuery({
    queryKey: ["quests", "closest", limit],
    queryFn: async () => {
      const { data } = await api.get<Quests[]>(`quests?limit=${limit}`);
      return data;
    },
  });

  return { data, isLoading };
}

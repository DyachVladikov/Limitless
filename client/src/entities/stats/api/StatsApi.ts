"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/axios";

export function useStats<T>() {
  const { data, isLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api.get<T>("stats/summary").then((res) => res.data),
  });

  return { data, isLoading };
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/axios";

export function useUser<T>() {
  const { data, isLoading } = useQuery({
    queryKey: ["user"],
    queryFn: () => api.get<T>("user").then((response) => response.data),
  });

  return { data, isLoading };
}

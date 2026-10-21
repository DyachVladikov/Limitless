"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/axios";
import { Profile } from "../model/types";

export function useProfile() {
  const { data, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data } = await api.get<Profile>("profile");
      return data;
    },
  });

  return { data, isLoading };
}

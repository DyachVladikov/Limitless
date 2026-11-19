"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/axios";
import type { FocusSession, SaveFocusInput } from "../model/types";

export function useSaveFocus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: SaveFocusInput) => {
      const { data } = await api.post<FocusSession>("focus", body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["focus"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

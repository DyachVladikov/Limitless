import type { CoachType } from "../model/CoachType";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/axios";

export const useGetCoaches = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["coaches"],
    queryFn: () => api.get<CoachType[]>("/coaches"),
  });
  return { data, isLoading };
};

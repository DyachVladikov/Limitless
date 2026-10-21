import type { MentorPhraseEvent, MentorMood, MentorSection } from "../model/CoachType";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/axios";

export type PageMentor = {
  mentorId: string;
  name: string;
  phraseId: string;
  event: MentorPhraseEvent;
  mood: MentorMood;
  text: string;
  image: string;
};

export const useGetCoaches = (section: MentorSection) => {
  const { data, isLoading } = useQuery({
    queryKey: ["mentors", "page", section],
    queryFn: async () => {
      const { data } = await api.get<PageMentor | null>(
        `mentors/page?section=${section}`,
      );
      return data;
    },
  });
  return { data, isLoading };
};

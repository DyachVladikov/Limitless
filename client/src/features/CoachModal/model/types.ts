import type { MentorType } from "@/entities/coaches";

export interface CoachModal {
  popup: MentorType | null;
  isOpen: boolean;
}

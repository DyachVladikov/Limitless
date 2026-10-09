import { CoachType } from "@/entities/coaches";

export interface CoachModal {
  coach: CoachType | null;
  isOpen: boolean;
}

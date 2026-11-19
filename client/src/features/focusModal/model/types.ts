export type FocusModal = {
  isOpen: boolean;
  isActive: boolean;
  startTime: number | null;
  accumulatedSeconds: number;
};

export type SaveFocusInput = {
  id: string;
  durationSeconds: number;
};

export type FocusSession = {
  id: string;
  gameDate: string;
  durationSeconds: number;
  creditedSeconds: number;
  awardedXp: number;
  balanceVersion: string;
  savedAt: string;
  createdAt: string;
  updatedAt: string;
  version: string;
};

export type FocusSummary = {
  gameDate: string;
  durationSeconds: number;
  creditedSeconds: number;
  awardedXp: number;
  dailyLimitSeconds: number;
};

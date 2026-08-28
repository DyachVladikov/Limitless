"use client";

import { usePathname } from "next/navigation";
import { ManagerFocusModal } from "@/features";
import { useTimer } from "@/features/focusModal/lib/useTimer";
import { formatTime } from "@/shared/lib/formatTime";
import { ROUTES } from "@/shared/config/routes";
import "./FocusMini.scss";
import { useAppSelector } from "@/app/hooks/useAppStore";

const RING_RADIUS = 15.5;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

export const FocusMini = () => {
  const pathname = usePathname();
  const { displaySeconds } = useTimer();
  const { isActive } = useAppSelector((state) => state.focusModal);

  if (pathname === ROUTES.HOME) {
    return null;
  }

  const progress = (displaySeconds % 60) / 60;

  return (
    <div className="focus-mini">
      <div className="focus-mini__ring-wrap">
        <svg className="focus-mini__ring" viewBox="0 0 40 40">
          <circle
            className="focus-mini__ring-track"
            cx={20}
            cy={20}
            r={RING_RADIUS}
          />
          <circle
            className="focus-mini__ring-progress"
            cx={20}
            cy={20}
            r={RING_RADIUS}
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={RING_LENGTH * (1 - progress)}
            transform={`rotate(-90 20 20)`}
          />
        </svg>
        <ManagerFocusModal mini />
      </div>
      <div className="focus-mini__info">
        <span className="focus-mini__label">Focus mode</span>
        <span className="focus-mini__time">{formatTime(displaySeconds)}</span>
      </div>
    </div>
  );
};

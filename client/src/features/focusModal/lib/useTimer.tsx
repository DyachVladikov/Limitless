import { useEffect, useState } from "react";
import { useAppSelector } from "@/app/hooks/useAppStore";

export const useTimer = () => {
  const { isActive, startTime, accumulatedSeconds } = useAppSelector(
    (state) => state.focusModal,
  );

  const [displaySeconds, setDisplaySeconds] = useState(() => {
    if (isActive && startTime) {
      const currentSessionSeconds = Math.floor((Date.now() - startTime) / 1000);
      return accumulatedSeconds + currentSessionSeconds;
    }
    return accumulatedSeconds;
  });

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isActive && startTime) {
      interval = setInterval(() => {
        const now = Date.now();
        const currentSessionSeconds = Math.floor((now - startTime) / 1000);
        setDisplaySeconds(accumulatedSeconds + currentSessionSeconds);
      }, 1000);
    } else {
      setDisplaySeconds(accumulatedSeconds);
    }
    return () => clearInterval(interval);
  }, [isActive, startTime, accumulatedSeconds]);

  return { displaySeconds, isActive };
};

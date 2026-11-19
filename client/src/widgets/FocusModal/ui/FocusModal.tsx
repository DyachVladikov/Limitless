"use client";

import { ManagerFocusModal, useSaveFocus } from "@/features";
import { useTimer } from "@/features/focusModal/lib/useTimer";
import {
  resetTimer,
  sendTimer,
} from "@/features/focusModal/model/FocusModalSlice";
import { useAppDispatch } from "@/app/hooks/useAppStore";
import { formatTime } from "@/shared/lib/formatTime";
import { FaUndo } from "react-icons/fa";
import "./FocusModal.scss";
import { Button } from "@/shared/Button";
import { useEffect, useRef, useState } from "react";

const RING_RADIUS = 120;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

export const FocusModal = () => {
  const { displaySeconds, isActive } = useTimer();
  const [isButtonDisabled, setIsButtonDisabled] = useState(false);
  const {
    mutate: saveFocus,
    isSuccess: isSuccessSaveFocus,
    isError: isErrorSaveFocus,
  } = useSaveFocus();
  const dispatch = useAppDispatch();
  const progress = (displaySeconds % 60) / 60;
  const headAngle = progress * 360;
  const statusRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!isSuccessSaveFocus && !isErrorSaveFocus) {
      return;
    }

    const fadeTimer = window.setTimeout(() => {
      statusRef.current?.classList.add("focus-modal__success--leaving");
    }, 5000);

    return () => window.clearTimeout(fadeTimer);
  }, [isSuccessSaveFocus, isErrorSaveFocus]);

  const onSend = () => {
    setIsButtonDisabled(true);
    saveFocus(
      { id: crypto.randomUUID(), durationSeconds: displaySeconds },
      {
        onSuccess: () => {
          dispatch(sendTimer(true));
        },
        onError: () => {
          dispatch(sendTimer(false));
        },
        onSettled: () => {
          setIsButtonDisabled(false);
        },
      },
    );
  };

  return (
    <div className="focus-modal widget">
      <div className="focus-modal__header">
        <h3 className="focus-modal__title">
          <span className="focus-modal__title-diamond" />
          Focus mode
        </h3>
        <Button
          type="button"
          onlyIcon
          className="focus-modal__reset"
          onClick={() => dispatch(resetTimer())}
          title="Сбросить таймер"
          icon={<FaUndo />}
        ></Button>
      </div>
      <div className="focus-modal__circle">
        <svg className="focus-modal__ring" viewBox="0 0 260 260">
          <defs>
            <linearGradient
              id="focus-ring-gradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#6d28d9" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
          <circle
            className="focus-modal__ring-track"
            cx={130}
            cy={130}
            r={RING_RADIUS}
          />
          <circle
            className="focus-modal__ring-progress"
            cx={130}
            cy={130}
            r={RING_RADIUS}
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={RING_LENGTH * (1 - progress)}
            transform={`rotate(-90 130 130)`}
          />
          <g
            className="focus-modal__ring-head"
            style={{ transform: `rotate(${headAngle}deg)` }}
          >
            <circle cx={130} cy={130 - RING_RADIUS} r={5.5} />
          </g>
        </svg>
        <div className="focus-modal__center">
          <span className="focus-modal__time">
            {formatTime(displaySeconds)}
          </span>
          <span className="focus-modal__subtitle">Deep work session</span>
          <ManagerFocusModal />
        </div>
      </div>
      {displaySeconds > 0 && !isActive && (
        <>
          <Button
            className="focus-modal__button-send"
            label="Send"
            title="Send"
            onClick={onSend}
            disabled={isButtonDisabled}
          ></Button>

          {isErrorSaveFocus && (
            <p ref={statusRef} className="focus-modal__error">
              Error saving focus session
            </p>
          )}
        </>
      )}
      {isSuccessSaveFocus && (
        <p ref={statusRef} className="focus-modal__success">
          Focus session saved
        </p>
      )}
    </div>
  );
};

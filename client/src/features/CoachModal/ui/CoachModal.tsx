"use client";
import { Button } from "@/shared/Button";
import { FaTimes } from "react-icons/fa";
import "./CoachModal.scss";
import { useAppDispatch, useAppSelector } from "@/app/hooks/useAppStore";
import { coachModalSlice } from "../model/CoachModalSlice";

const SOUND_BARS = [
  { x: 3, y: 10, height: 4 },
  { x: 7, y: 6, height: 12 },
  { x: 11, y: 2, height: 20 },
  { x: 15, y: 6, height: 12 },
  { x: 19, y: 10, height: 4 },
];

const { closeModal } = coachModalSlice.actions;

export const CoachModal = () => {
  const dispatch = useAppDispatch();
  const CloseButton = () => {
    dispatch(closeModal());
  };

  const { isOpen } = useAppSelector((state) => state.coachModal);
  if (!isOpen) {
    return null;
  }
  return (
    <div className="coach-modal">
      <div className="coach-modal__wrapper">
        <div className="coach-modal__header">
          <Button
            className="coach-modal__close-button"
            onlyIcon
            icon={<FaTimes />}
            label="закрыть"
            onClick={CloseButton}
            hoveredIcon={true}
          ></Button>
          <img
            className="coach-modal__image"
            src={"/assets/coaches/mainCoach/1.png"}
            alt="coach"
          />
        </div>
        <div className="coach-modal__content">
          <div className="coach-modal__content-header">
            <h6>Mentor Gojo Satoru</h6>
            <span className="coach-modal__sound" aria-hidden>
              <svg
                className="coach-modal__sound-icon"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                {SOUND_BARS.map((bar) => (
                  <rect
                    key={bar.x}
                    className="coach-modal__sound-bar"
                    x={bar.x}
                    y={bar.y}
                    width="2"
                    height={bar.height}
                    rx="0.5"
                  />
                ))}
              </svg>
            </span>
          </div>
          <div className="coach-modal__content-main">
            <div className="coach-modal__content-main-replica">
              <p>
                Hello, I'm Gojo Satoru, your mentor for this course. I'm a
                professional coach with 10 years of experience in the field. I'm
                here to help you achieve your goals and become a better version
                of yourself.
              </p>
            </div>
            <div className="coach-modal__content-main-blocks">
              <span className="coach-modal__content-main-description-title">
                блоки которые отстают
              </span>
            </div>
            <Button
              className="coach-modal__content-main-get-motivated"
              label="Get Motivated"
              title="Get Motivated"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

"use client";
import { Button } from "@/shared/Button";
import { FaTimes } from "react-icons/fa";
import "./CoachModal.scss";
import { useAppDispatch, useAppSelector } from "@/app/hooks/useAppStore";
import { coachModalSlice } from "../model/CoachModalSlice";
import classNames from "classnames";
import { useEffect, useState } from "react";
import { api } from "@/shared/api/axios";

const SOUND_BARS = [
  { x: 3, y: 10, height: 4 },
  { x: 7, y: 6, height: 12 },
  { x: 11, y: 2, height: 20 },
  { x: 15, y: 6, height: 12 },
  { x: 19, y: 10, height: 4 },
];

const { closeModal } = coachModalSlice.actions;
const sentPopupVersions = new Set<string>();

export const CoachModal = () => {
  const dispatch = useAppDispatch();
  const CloseButton = () => {
    dispatch(closeModal());
  };

  const { isOpen, popup } = useAppSelector((state) => state.coachModal);
  const [isMounted, setIsMounted] = useState(isOpen);
  const [motion, setMotion] = useState<"enter" | "leave" | null>(
    isOpen ? "enter" : null,
  );
  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      setMotion("enter");
      return;
    }
    if (!isMounted) {
      return;
    }
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reducedMotion) {
      setIsMounted(false);
      setMotion(null);
      return;
    }
    setMotion("leave");
  }, [isOpen, isMounted]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeTimer = setTimeout(() => {
      dispatch(closeModal());
    }, 7000);

    return () => {
      clearTimeout(closeTimer);
    };
  }, [isOpen, dispatch]);

  useEffect(() => {
    if (!isMounted || !popup) {
      return;
    }
    if (sentPopupVersions.has(popup.version)) {
      return;
    }

    sentPopupVersions.add(popup.version);
    api
      .post("mentors/popup/seen", { version: popup.version })
      .catch(() => undefined);
  }, [isMounted, popup]);

  if (!isMounted || !popup) {
    return null;
  }

  console.log(popup);

  return (
    <div
      className={classNames("coach-modal", {
        "coach-modal--enter": motion === "enter",
        "coach-modal--leave": motion === "leave",
      })}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) {
          return;
        }
        if (motion === "leave") {
          setIsMounted(false);
          setMotion(null);
        }
      }}
    >
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
            <h6>{popup.name}</h6>
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
              <p>{popup.phrases[0]?.text}</p>
            </div>
            <div className="coach-modal__content-main-blocks">
              <span className="coach-modal__content-main-description-title">
                блоки которые отстают
              </span>
            </div>
            <Button
              className="coach-modal__content-main-confirm"
              label="Confirm"
              title="Confirm"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

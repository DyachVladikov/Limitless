"use client";

import StatsRadar from "./StatsRadar";
import RankBadge from "@/shared/RankBadge";
import { User, UserApi } from "@/entities/user";
import "./SkillsSection.scss";
import { useEffect } from "react";
import { Stats, StatsApi } from "@/entities/stats";
import { StatsTracker } from "./StatsTracker";

export const SkillsSection = () => {
  const { data: user, isLoading } = UserApi<User>();
  const { data: stats } = StatsApi<Stats>();

  useEffect(() => {
    console.log("stats:  ", stats);
  }, [stats]);

  if (isLoading) {
    return <section className="skills-section section">Загрузка...</section>;
  }

  if (!user) {
    return (
      <section className="skills-section section">
        Не удалось загрузить профиль
      </section>
    );
  }

  return (
    <section className="skills-section section">
      <div className="skills-section__user">
        <div className="skills-section__user-avatar">
          <img src="/avatar.png" alt="avatar" />
          <svg
            width="0"
            height="0"
            style={{ position: "absolute", bottom: "10px" }}
            aria-hidden="true"
          >
            <filter id="smoke-filter">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.010 0.04"
                numOctaves="4"
                seed="7"
                result="noise"
              >
                <animate
                  attributeName="baseFrequency"
                  values="0.012 0.04;0.016 0.05;0.012 0.04"
                  dur="14s"
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="80"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </svg>
          {user.streak > -1 && (
            <div className="skills-section__user-avatar-streak">
              {user.streak}
            </div>
          )}
        </div>
        <div className="skills-section__user-info">
          <h2 className="skills-section__user-name">{user.name}</h2>
          <div className="skills-section__user-rank">
            <span>Rank </span>
            <RankBadge rank={user.rank} />
          </div>

          <div className="skills-section__user-bar">
            <div className="skills-section__user-level">
              <span className="skills-section__user-level-text">Level</span>
              {`${user.level.currentExp} / ${user.level.expToNextLevel}`}
            </div>
            <div className="skills-section__user-bar-wrapper">
              <div
                className="skills-section__user-bar-inner"
                style={{ width: `${user.exp}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>
      <StatsRadar stats={user.stats} />
      <StatsTracker stats={stats} />
    </section>
  );
};

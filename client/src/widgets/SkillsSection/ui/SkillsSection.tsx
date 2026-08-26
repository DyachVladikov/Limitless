"use client";

import StatsRadar from "./StatsRadar";
import RankBadge from "@/shared/RankBadge";
import { User, useUser } from "@/entities/user";
import "./SkillsSection.scss";
import { Stats, useStats } from "@/entities/stats";
import { StatsTracker } from "./StatsTracker";
import { FaFire } from "react-icons/fa";

export const SkillsSection = () => {
  const { data: user, isLoading } = useUser<User>();
  const { data: stats } = useStats<Stats>();

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

  const expRatio = Math.min(
    100,
    (user.level.currentExp / user.level.expToNextLevel) * 100,
  );

  return (
    <section className="skills-section section">
      <div className="skills-section__user">
        <div className="skills-section__hero">
          <span className="skills-section__hero-aura" />
          <span className="skills-section__hero-smoke skills-section__hero-smoke--left" />
          <span className="skills-section__hero-smoke skills-section__hero-smoke--right" />
          <img
            className="skills-section__hero-img"
            src="/avatar.png"
            alt={user.name}
          />
          <span className="skills-section__hero-fade" />
          {user.streak > 0 && (
            <div className="skills-section__streak" title="Day streak">
              <FaFire className="skills-section__streak-icon" />
              <span className="skills-section__streak-value">
                {user.streak}
              </span>
            </div>
          )}
        </div>

        <h2 className="skills-section__user-name">{user.name}</h2>

        <div className="skills-section__user-badges">
          <span className="skills-section__user-pill">
            <span className="skills-section__user-pill-label">Rank</span>
            <RankBadge rank={user.rank} />
          </span>
          <span className="skills-section__user-pill skills-section__user-pill--level">
            Level {user.level.currentLevel}
          </span>
        </div>

        <div className="skills-section__user-bar">
          <div className="skills-section__user-level">
            <span className="skills-section__user-level-text">Experience</span>
            <span className="skills-section__user-level-value">
              {`${user.level.currentExp} / ${user.level.expToNextLevel} XP`}
            </span>
          </div>
          <div className="skills-section__user-bar-wrapper">
            <div
              className="skills-section__user-bar-inner"
              style={{ width: `${expRatio}%` }}
            />
          </div>
        </div>
      </div>
      <div className="skills-section__radar">
        <StatsRadar stats={user.stats} />
      </div>
      <div className="skills-section__stats">
        <StatsTracker stats={stats} />
      </div>
    </section>
  );
};

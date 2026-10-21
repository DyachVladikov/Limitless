"use client";

import StatsRadar from "./StatsRadar";
import RankBadge from "@/shared/RankBadge";
import { ProfileStats, useProfile } from "@/entities/profile";
import "./SkillsSection.scss";
import { StatsTracker } from "./StatsTracker";
import { FaFire } from "react-icons/fa";

export const SkillsSection = () => {
  const { data: profile, isLoading } = useProfile();

  if (isLoading) {
    return <section className="skills-section section">Загрузка...</section>;
  }

  if (!profile) {
    return (
      <section className="skills-section section">
        Не удалось загрузить профиль
      </section>
    );
  }

  const expRatio = Math.min(
    100,
    (profile.levelExp / profile.nextLevelExp) * 100,
  );
  const stats: ProfileStats = {
    statIntelligence: profile.statIntelligence,
    statStrength: profile.statStrength,
    statRationality: profile.statRationality,
    statEgo: profile.statEgo,
    statDiscipline: profile.statDiscipline,
    statEnergy: profile.statEnergy,
  };

  return (
    <section className="skills-section section">
      <div className="skills-section__profile">
        <div className="skills-section__hero">
          <span className="skills-section__hero-aura" />
          <span className="skills-section__hero-smoke skills-section__hero-smoke--left" />
          <span className="skills-section__hero-smoke skills-section__hero-smoke--right" />
          <img
            className="skills-section__hero-img"
            src="/avatar.png"
            alt={profile.name}
          />
          <span className="skills-section__hero-fade" />
          {profile.activityStreak > 0 && (
            <div className="skills-section__streak" title="Day streak">
              <FaFire className="skills-section__streak-icon" />
              <span className="skills-section__streak-value">
                {profile.activityStreak}
              </span>
            </div>
          )}
        </div>

        <h2 className="skills-section__profile-name">{profile.name}</h2>

        <div className="skills-section__profile-badges">
          <span className="skills-section__profile-pill">
            <span className="skills-section__profile-pill-label">Rank</span>
            <RankBadge rank={profile.rank} />
          </span>
          <span className="skills-section__profile-pill skills-section__profile-pill--level">
            Level {profile.level}
          </span>
        </div>

        <div className="skills-section__profile-bar">
          <div className="skills-section__profile-level">
            <span className="skills-section__profile-level-text">
              Experience
            </span>
            <span className="skills-section__profile-level-value">
              {`${profile.levelExp} / ${profile.nextLevelExp} XP`}
            </span>
          </div>
          <div className="skills-section__profile-bar-wrapper">
            <div
              className="skills-section__profile-bar-inner"
              style={{ width: `${expRatio}%` }}
            />
          </div>
        </div>
      </div>
      <div className="skills-section__radar">
        <StatsRadar stats={stats} />
      </div>
      <div className="skills-section__stats">
        <StatsTracker
          stats={{
            tasksCompleted: profile.questCounters.dailyTasksCompleted ?? 0,
            dailySetsCompleted: profile.questCounters.dailySetsCompleted ?? 0,
            activityStreak: profile.activityStreak,
            totalExp: profile.totalExp,
          }}
        />
      </div>
    </section>
  );
};

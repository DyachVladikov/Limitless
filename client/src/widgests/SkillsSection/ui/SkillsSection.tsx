"use client";

import { useAppSelector } from "@/app/hooks/useAppStore";
import type { User } from "@/entities/user/model/types";
import type { IconType } from "react-icons";
import {
  FaBolt,
  FaBookOpen,
  FaBrain,
  FaCrown,
  FaDumbbell,
  FaMountain,
  FaRegQuestionCircle,
} from "react-icons/fa";
import "./SkillsSection.scss";

const RADAR_SIZE = 680;
const RADAR_CENTER = RADAR_SIZE / 2;
const RADAR_RADIUS = 160;
const RING_RATIOS = [0.25, 0.5, 0.75, 1];
const MAX_STAT_VALUE = 100;
const LABEL_RADIUS_RATIO = 1.38;
const LABEL_TEXT_OFFSET = 34;

const STATS_CONFIG: { key: keyof User["stats"]; name: string; Icon: IconType }[] =
  [
    { key: "statDiscipline", name: "Discipline", Icon: FaMountain },
    { key: "statStrength", name: "Strength", Icon: FaDumbbell },
    { key: "statEnergy", name: "Energy", Icon: FaBolt },
    { key: "statRationality", name: "Rationality", Icon: FaBrain },
    { key: "statEgo", name: "Ego", Icon: FaCrown },
    { key: "statIntelligence", name: "Intelligence", Icon: FaBookOpen },
  ];

const LABEL_SIDES = ["top", "right", "right", "bottom", "left", "left"];

const getRadarPoint = (index: number, ratio: number) => {
  const angle = ((-90 + index * 60) * Math.PI) / 180;
  return {
    x: RADAR_CENTER + RADAR_RADIUS * ratio * Math.cos(angle),
    y: RADAR_CENTER + RADAR_RADIUS * ratio * Math.sin(angle),
  };
};

const getPolygonPoints = (ratios: number[]) =>
  ratios
    .map((ratio, index) => {
      const { x, y } = getRadarPoint(index, ratio);
      return `${x},${y}`;
    })
    .join(" ");

export const SkillsSection = () => {
  const user = useAppSelector((state) => state.user);
  const statRatios = STATS_CONFIG.map(
    ({ key }) => Math.min(user.stats[key], MAX_STAT_VALUE) / MAX_STAT_VALUE,
  );
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
          <div className="skills-section__user-name-rank">
            <h2 className="skills-section__user-name">{user.name}</h2>
            <span className="skills-section__user-rank">Rank {user.rank}</span>
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
      <div className="skills-section__dashboard">
        <div className="skills-section__dashboard-title">
          Character Attributes
          <FaRegQuestionCircle />
        </div>
        <div className="skills-section__radar">
          <svg
            className="skills-section__radar-chart"
            viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
          >
            <defs>
              <radialGradient id="radar-backdrop" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="radar-fill" cx="50%" cy="50%" r="65%">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.3" />
                <stop offset="70%" stopColor="#6d28d9" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#4c1d95" stopOpacity="0.55" />
              </radialGradient>
              <filter
                id="radar-glow"
                x="-60%"
                y="-60%"
                width="220%"
                height="220%"
              >
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <circle
              cx={RADAR_CENTER}
              cy={RADAR_CENTER}
              r={RADAR_RADIUS * 1.2}
              fill="url(#radar-backdrop)"
            />
            {RING_RATIOS.map((ratio) => (
              <polygon
                key={ratio}
                className={`skills-section__radar-ring${
                  ratio === 1 ? " skills-section__radar-ring--outer" : ""
                }`}
                points={getPolygonPoints(RING_RATIOS.map(() => ratio))}
              />
            ))}
            {STATS_CONFIG.map((_, index) => {
              const { x, y } = getRadarPoint(index, 1);
              return (
                <line
                  key={index}
                  className="skills-section__radar-axis"
                  x1={RADAR_CENTER}
                  y1={RADAR_CENTER}
                  x2={x}
                  y2={y}
                />
              );
            })}
            <polygon
              className="skills-section__radar-polygon"
              points={getPolygonPoints(statRatios)}
            />
            {statRatios.map((ratio, index) => {
              const { x, y } = getRadarPoint(index, ratio);
              return (
                <circle
                  key={index}
                  className="skills-section__radar-dot"
                  cx={x}
                  cy={y}
                  r={6}
                />
              );
            })}
            {STATS_CONFIG.map((_, index) => {
              const { x, y } = getRadarPoint(index, 1);
              return (
                <circle
                  key={index}
                  className="skills-section__radar-vertex"
                  cx={x}
                  cy={y}
                  r={3}
                />
              );
            })}
            {STATS_CONFIG.map(({ key, name, Icon }, index) => {
              const { x, y } = getRadarPoint(index, LABEL_RADIUS_RATIO);
              const isLeft = LABEL_SIDES[index] === "left";
              const textX = isLeft
                ? x - LABEL_TEXT_OFFSET
                : x + LABEL_TEXT_OFFSET;
              return (
                <g key={key}>
                  <circle
                    className="skills-section__stat-badge"
                    cx={x}
                    cy={y}
                    r={26}
                  />
                  <Icon
                    x={x - 11}
                    y={y - 11}
                    width={22}
                    height={22}
                    className="skills-section__stat-icon"
                  />
                  <text
                    className="skills-section__stat-name"
                    x={textX}
                    y={y - 4}
                    textAnchor={isLeft ? "end" : "start"}
                  >
                    {name}
                  </text>
                  <text
                    className="skills-section__stat-value"
                    x={textX}
                    y={y + 22}
                    textAnchor={isLeft ? "end" : "start"}
                  >
                    {user.stats[key]}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </section>
  );
};

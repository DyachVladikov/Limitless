"use client";

import { useId, useState } from "react";
import type { ProfileStats } from "@/entities/profile";
import type { IconType } from "react-icons";
import {
  FaBolt,
  FaBookOpen,
  FaBrain,
  FaCrown,
  FaDumbbell,
  FaMountain,
  FaRegCompass,
  FaThumbtack,
} from "react-icons/fa";
import "./StatsRadar.scss";

const CHART_WIDTH = 800;
const CHART_HEIGHT = 640;
const CENTER_X = CHART_WIDTH / 2;
const CENTER_Y = CHART_HEIGHT / 2;
const RADAR_RADIUS = 222;
const RING_RATIOS = [0.2, 0.4, 0.6, 0.8, 1];
const BEZEL_TICKS = Array.from({ length: 72 }, (_, index) => index);
const POINT_PLURALS = new Intl.PluralRules("ru");

const STATS_CONFIG: {
  key: keyof ProfileStats;
  name: string;
  Icon: IconType;
  position: string;
  description: string;
}[] = [
  {
    key: "statDiscipline",
    name: "Discipline",
    Icon: FaMountain,
    position: "top",
    description: "Умение двигаться вперёд, даже когда мотивация заканчивается.",
  },
  {
    key: "statStrength",
    name: "Strength",
    Icon: FaDumbbell,
    position: "top-right",
    description: "Физическая сила, которая растёт с каждой тренировкой.",
  },
  {
    key: "statEnergy",
    name: "Energy",
    Icon: FaBolt,
    position: "bottom-right",
    description: "Запас энергии, чтобы действовать и справляться с нагрузкой.",
  },
  {
    key: "statRationality",
    name: "Rationality",
    Icon: FaBrain,
    position: "bottom",
    description: "Ясное мышление, взвешенные решения и осознанные действия.",
  },
  {
    key: "statEgo",
    name: "Ego",
    Icon: FaCrown,
    position: "bottom-left",
    description: "Уверенность в себе и готовность отвечать за свой выбор.",
  },
  {
    key: "statIntelligence",
    name: "Intelligence",
    Icon: FaBookOpen,
    position: "top-left",
    description: "Знания и навыки, которые растут с каждым новым открытием.",
  },
];

const getRadarPoint = (index: number, ratio: number) => {
  const angle = ((-90 + index * 60) * Math.PI) / 180;

  return {
    x: CENTER_X + RADAR_RADIUS * ratio * Math.cos(angle),
    y: CENTER_Y + RADAR_RADIUS * ratio * Math.sin(angle),
  };
};

const getPolygonPoints = (ratios: number[]) =>
  ratios
    .map((ratio, index) => {
      const point = getRadarPoint(index, ratio);
      return `${point.x},${point.y}`;
    })
    .join(" ");

const getSectorPoints = (index: number) => {
  const sideRatio = Math.cos(Math.PI / 6);
  const start = getRadarPoint(index - 0.5, sideRatio);
  const vertex = getRadarPoint(index, 1);
  const end = getRadarPoint(index + 0.5, sideRatio);

  return `${CENTER_X},${CENTER_Y} ${start.x},${start.y} ${vertex.x},${vertex.y} ${end.x},${end.y}`;
};

const getScaleMax = (highestStat: number) => {
  const targetMax = highestStat * 1.2;

  if (targetMax <= 10) {
    return 10;
  }

  const magnitude = 10 ** Math.floor(Math.log10(targetMax));
  const steps = [1, 2, 5, 10];
  const step = steps.find((value) => value * magnitude >= targetMax) ?? 10;

  return step * magnitude;
};

const getPointLabel = (value: number) => {
  const plural = POINT_PLURALS.select(value);

  if (plural === "one") {
    return "очко";
  }

  if (plural === "few" || plural === "other") {
    return "очка";
  }

  return "очков";
};

type StatsRadarProps = {
  stats: ProfileStats;
};

export default function StatsRadar({ stats }: StatsRadarProps) {
  const chartId = useId();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const previewIndex = hoveredIndex ?? focusedIndex;
  const activeIndex = previewIndex ?? selectedIndex;
  const activeStat = activeIndex === null ? null : STATS_CONFIG[activeIndex];
  const ActiveIcon = activeStat?.Icon ?? FaRegCompass;
  const activeValue = activeStat ? stats[activeStat.key] : null;
  const highestStat = Math.max(...STATS_CONFIG.map(({ key }) => stats[key]));
  const scaleMax = getScaleMax(highestStat);
  const statRatios = STATS_CONFIG.map(
    ({ key }) => Math.max(0, stats[key]) / scaleMax,
  );
  const totalPower = STATS_CONFIG.reduce((sum, { key }) => sum + stats[key], 0);
  const activePoint =
    activeIndex === null
      ? { x: CENTER_X, y: CENTER_Y }
      : getRadarPoint(activeIndex, statRatios[activeIndex]);
  const guideEnd = getRadarPoint(activeIndex ?? 0, 1.13);
  const arcStart = getRadarPoint((activeIndex ?? 0) - 0.35, 252 / RADAR_RADIUS);
  const arcEnd = getRadarPoint((activeIndex ?? 0) + 0.35, 252 / RADAR_RADIUS);
  const tooltipX =
    activePoint.x >= CENTER_X ? activePoint.x - 184 : activePoint.x + 20;
  const tooltipY =
    activePoint.y < CENTER_Y ? activePoint.y + 22 : activePoint.y - 86;
  const outerPoints = getPolygonPoints(STATS_CONFIG.map(() => 1));
  const dataPoints = getPolygonPoints(statRatios);
  const detailId = `${chartId}-detail`;
  let detailStatus = "Характеристики";

  if (activeStat) {
    detailStatus = activeIndex === selectedIndex ? "Закреплено" : "Просмотр";
  }

  const togglePin = (index: number) => {
    setSelectedIndex((currentIndex) => (currentIndex === index ? null : index));
  };

  return (
    <section
      className={`stats-radar${previewIndex !== null ? " is-previewing" : ""}`}
      aria-labelledby={`${chartId}-heading`}
    >
      <div className="stats-radar__header">
        <h2 className="stats-radar__eyebrow" id={`${chartId}-heading`}>
          <span aria-hidden="true" />
          Character overview
        </h2>
        <div className="stats-radar__power">
          <span className="stats-radar__power-icon" aria-hidden="true">
            <FaBolt />
          </span>
          <div className="stats-radar__power-value">
            <span className="stats-radar__power-label">Total power</span>
            <strong>{totalPower}</strong>
          </div>
        </div>
      </div>

      <div
        className="stats-radar__stage"
        onPointerLeave={() => setHoveredIndex(null)}
      >
        <div className="stats-radar__atmosphere" aria-hidden="true" />
        <svg
          className="stats-radar__svg"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="img"
          aria-labelledby={`${chartId}-title ${chartId}-description`}
        >
          <title id={`${chartId}-title`}>
            Диаграмма характеристик персонажа
          </title>
          <desc id={`${chartId}-description`}>
            {STATS_CONFIG.map(({ key, name }) => `${name}: ${stats[key]}`).join(
              ", ",
            )}
            {`. Все шесть осей используют общий диапазон от 0 до ${scaleMax}.`}
          </desc>
          <defs>
            <radialGradient id={`${chartId}-surface`}>
              <stop offset="0%" stopColor="#241345" stopOpacity="0.8" />
              <stop offset="75%" stopColor="#16102c" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#0b0918" stopOpacity="0.9" />
            </radialGradient>
            <linearGradient
              id={`${chartId}-edge`}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#d8c8ff" />
              <stop offset="40%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#6d4aca" />
            </linearGradient>
            <linearGradient
              id={`${chartId}-fill`}
              x1="0%"
              y1="0%"
              x2="80%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.55" />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#6d28d9" stopOpacity="0.08" />
            </linearGradient>
            <radialGradient id={`${chartId}-sector`}>
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0" />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.22" />
            </radialGradient>
          </defs>

          <g className="stats-radar__instrument" aria-hidden="true">
            <circle
              className="stats-radar__bezel-shadow"
              cx={CENTER_X}
              cy={CENTER_Y}
              r={250}
            />
            <circle
              className="stats-radar__bezel"
              cx={CENTER_X}
              cy={CENTER_Y}
              r={252}
            />
            <circle
              className="stats-radar__bezel-inner"
              cx={CENTER_X}
              cy={CENTER_Y}
              r={241}
            />
            <circle
              className="stats-radar__orbit"
              cx={CENTER_X}
              cy={CENTER_Y}
              r={263}
            />
            {BEZEL_TICKS.map((index) => {
              const start = getRadarPoint(index / 12, 246 / RADAR_RADIUS);
              const end = getRadarPoint(
                index / 12,
                (index % 6 === 0 ? 256 : 250) / RADAR_RADIUS,
              );

              return (
                <line
                  key={index}
                  className={`stats-radar__bezel-tick${index % 6 === 0 ? " stats-radar__bezel-tick--major" : ""}`}
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                />
              );
            })}
            <polygon points={outerPoints} fill={`url(#${chartId}-surface)`} />
          </g>

          {STATS_CONFIG.map(({ key }, index) => (
            <polygon
              key={key}
              className={`stats-radar__sector${activeIndex === index ? " is-active" : ""}`}
              points={getSectorPoints(index)}
              fill={`url(#${chartId}-sector)`}
              aria-hidden="true"
            />
          ))}

          <g className="stats-radar__grid" aria-hidden="true">
            {RING_RATIOS.map((ratio) => (
              <polygon
                key={ratio}
                className={`stats-radar__ring${ratio === 1 ? " stats-radar__ring--outer" : ""}`}
                points={getPolygonPoints(STATS_CONFIG.map(() => ratio))}
              />
            ))}
            {STATS_CONFIG.map(({ key }, index) => {
              const point = getRadarPoint(index, 1);

              return (
                <line
                  key={key}
                  className={`stats-radar__axis${activeIndex === index ? " is-active" : ""}`}
                  x1={CENTER_X}
                  y1={CENTER_Y}
                  x2={point.x}
                  y2={point.y}
                />
              );
            })}
          </g>

          {activeIndex !== null && (
            <g className="stats-radar__guide" aria-hidden="true">
              <path
                className="stats-radar__active-arc"
                d={`M ${arcStart.x} ${arcStart.y} A 252 252 0 0 1 ${arcEnd.x} ${arcEnd.y}`}
              />
              {previewIndex !== null && (
                <>
                  <line
                    className="stats-radar__guide-line"
                    x1={activePoint.x}
                    y1={activePoint.y}
                    x2={guideEnd.x}
                    y2={guideEnd.y}
                  />
                  <circle
                    key={previewIndex}
                    className="stats-radar__hover-pulse"
                    cx={activePoint.x}
                    cy={activePoint.y}
                    r={10}
                  />
                </>
              )}
            </g>
          )}

          <g className="stats-radar__data" aria-hidden="true">
            <polygon
              className="stats-radar__polygon-glow"
              points={dataPoints}
            />
            <polygon
              className="stats-radar__polygon"
              points={dataPoints}
              fill={`url(#${chartId}-fill)`}
              stroke={`url(#${chartId}-edge)`}
            />
            {STATS_CONFIG.map(({ key }, index) => {
              const vertex = getRadarPoint(index, 1);
              const point = getRadarPoint(index, statRatios[index]);
              const isActive = activeIndex === index;

              return (
                <g key={key}>
                  <circle
                    className={`stats-radar__vertex${isActive ? " is-active" : ""}`}
                    cx={vertex.x}
                    cy={vertex.y}
                    r={3}
                  />
                  {statRatios[index] > 0 && (
                    <circle
                      className={`stats-radar__dot${isActive ? " is-active" : ""}`}
                      cx={point.x}
                      cy={point.y}
                      r={isActive ? 5.5 : 4}
                    />
                  )}
                </g>
              );
            })}
            {activeIndex !== null && (
              <>
                <circle
                  className="stats-radar__selection-halo"
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r={14}
                />
                <circle
                  className="stats-radar__selection-ring"
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r={10}
                />
              </>
            )}
            <circle
              className="stats-radar__center"
              cx={CENTER_X}
              cy={CENTER_Y}
              r={3}
            />
          </g>

          <g className="stats-radar__scale" aria-hidden="true">
            {RING_RATIOS.map((ratio) => (
              <text
                key={ratio}
                x={CENTER_X + 12}
                y={CENTER_Y + RADAR_RADIUS * ratio - 6}
              >
                {scaleMax * ratio}
              </text>
            ))}
          </g>
          <g className="stats-radar__mobile-icons" aria-hidden="true">
            {STATS_CONFIG.map(({ key, Icon }, index) => {
              const point = getRadarPoint(index, 258 / RADAR_RADIUS);

              return (
                <g
                  key={key}
                  className={activeIndex === index ? "is-active" : ""}
                  transform={`translate(${point.x}, ${point.y})`}
                >
                  <circle r={21} />
                  <Icon x={-12} y={-12} size={24} />
                </g>
              );
            })}
          </g>

          <g className="stats-radar__hit-targets" aria-hidden="true">
            {STATS_CONFIG.map(({ key }, index) => {
              const vertex = getRadarPoint(index, 1);
              const point = getRadarPoint(index, statRatios[index]);

              return (
                <g
                  key={key}
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") {
                      setHoveredIndex(index);
                    }
                  }}
                  onClick={() => togglePin(index)}
                >
                  <circle cx={vertex.x} cy={vertex.y} r={18} />
                  {statRatios[index] > 0 && (
                    <circle cx={point.x} cy={point.y} r={14} />
                  )}
                </g>
              );
            })}
          </g>

          {previewIndex !== null && activeStat && (
            <g
              className="stats-radar__tooltip"
              transform={`translate(${tooltipX}, ${tooltipY})`}
              aria-hidden="true"
            >
              <rect width={164} height={64} rx={10} />
              <text className="stats-radar__tooltip-name" x={14} y={22}>
                {activeStat.name}
              </text>
              <text className="stats-radar__tooltip-value" x={14} y={50}>
                {activeValue}
              </text>
              <text
                className="stats-radar__tooltip-status"
                x={150}
                y={48}
                textAnchor="end"
              >
                {activeIndex === selectedIndex ? "Закреплено" : "Просмотр"}
              </text>
            </g>
          )}
        </svg>

        <div
          className="stats-radar__attributes"
          role="group"
          aria-label="Характеристики персонажа"
        >
          {STATS_CONFIG.map(({ key, name, Icon, position }, index) => (
            <button
              className={`stats-radar__attribute stats-radar__attribute--${position}${selectedIndex === index ? " is-selected" : ""}${previewIndex === index ? " is-previewed" : ""}`}
              key={key}
              type="button"
              aria-pressed={selectedIndex === index}
              aria-controls={detailId}
              aria-label={`${name}: ${stats[key]}. ${selectedIndex === index ? "Открепить" : "Закрепить"} описание`}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") {
                  setHoveredIndex(index);
                }
              }}
              onFocus={(event) => {
                if (event.currentTarget.matches(":focus-visible")) {
                  setHoveredIndex(null);
                  setFocusedIndex(index);
                }
              }}
              onBlur={() => setFocusedIndex(null)}
              onClick={() => togglePin(index)}
            >
              {selectedIndex === index && (
                <FaThumbtack className="stats-radar__pin" aria-hidden="true" />
              )}
              <span className="stats-radar__attribute-icon">
                <Icon />
              </span>
              <span className="stats-radar__attribute-copy">
                <span className="stats-radar__attribute-name">{name}</span>
                <span className="stats-radar__attribute-value">
                  {stats[key]}
                </span>
              </span>
              <span className="stats-radar__attribute-meter" aria-hidden="true">
                <span style={{ width: `${statRatios[index] * 100}%` }} />
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="stats-radar__detail" id={detailId}>
        <div className="stats-radar__detail-icon" aria-hidden="true">
          <ActiveIcon />
        </div>
        <div className="stats-radar__detail-copy">
          <span className="stats-radar__detail-eyebrow">{detailStatus}</span>
          <h3>{activeStat?.name ?? "Выберите характеристику"}</h3>
          <p>
            {activeStat?.description ??
              "Наведите на атрибут, чтобы узнать больше. Нажмите, чтобы закрепить описание."}
          </p>
        </div>
        {activeValue !== null && (
          <div className="stats-radar__detail-value">
            <strong>{activeValue}</strong>
            <span>{getPointLabel(activeValue)}</span>
          </div>
        )}
      </div>
      <div className="stats-radar__footer">
        <span className="stats-radar__hint">
          <span aria-hidden="true">↗</span>
          <span className="stats-radar__hint-desktop">
            Наведите для просмотра · Нажмите, чтобы закрепить или открепить
          </span>
          <span className="stats-radar__hint-touch">
            Нажмите, чтобы закрепить · Ещё раз — открепить
          </span>
        </span>
        <span
          className="stats-radar__scale-caption"
          title="Общий диапазон для всех характеристик: минимум 10, с запасом не менее 20% над максимальным значением."
        >
          <span aria-hidden="true" /> Диапазон <strong>0–{scaleMax}</strong>
        </span>
      </div>
    </section>
  );
}

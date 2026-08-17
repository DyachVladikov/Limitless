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
import "./StatsRadar.scss";

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

type StatsRadarProps = {
  stats: User["stats"];
};

export default function StatsRadar({ stats }: StatsRadarProps) {
  const statRatios = STATS_CONFIG.map(
    ({ key }) => Math.min(stats[key], MAX_STAT_VALUE) / MAX_STAT_VALUE,
  );

  return (
    <div className="stats-radar">
      <div className="stats-radar__title">
        Character Attributes
        <FaRegQuestionCircle />
      </div>
      <div className="stats-radar__chart">
        <svg
          className="stats-radar__svg"
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
              className={`stats-radar__ring${
                ratio === 1 ? " stats-radar__ring--outer" : ""
              }`}
              points={getPolygonPoints(RING_RATIOS.map(() => ratio))}
            />
          ))}
          {STATS_CONFIG.map((_, index) => {
            const { x, y } = getRadarPoint(index, 1);
            return (
              <line
                key={index}
                className="stats-radar__axis"
                x1={RADAR_CENTER}
                y1={RADAR_CENTER}
                x2={x}
                y2={y}
              />
            );
          })}
          <polygon
            className="stats-radar__polygon"
            points={getPolygonPoints(statRatios)}
          />
          {statRatios.map((ratio, index) => {
            const { x, y } = getRadarPoint(index, ratio);
            return (
              <circle
                key={index}
                className="stats-radar__dot"
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
                className="stats-radar__vertex"
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
                  className="stats-radar__badge"
                  cx={x}
                  cy={y}
                  r={26}
                />
                <Icon
                  x={x - 11}
                  y={y - 11}
                  width={22}
                  height={22}
                  className="stats-radar__icon"
                />
                <text
                  className="stats-radar__name"
                  x={textX}
                  y={y - 4}
                  textAnchor={isLeft ? "end" : "start"}
                >
                  {name}
                </text>
                <text
                  className="stats-radar__value"
                  x={textX}
                  y={y + 22}
                  textAnchor={isLeft ? "end" : "start"}
                >
                  {stats[key]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

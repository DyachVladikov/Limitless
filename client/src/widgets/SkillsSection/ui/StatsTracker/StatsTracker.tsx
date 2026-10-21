import "./StatsTracker.scss";
import type { IconType } from "react-icons";
import {
  FaCheckDouble,
  FaFire,
  FaLayerGroup,
  FaStar,
} from "react-icons/fa";

export type TrackerStats = {
  tasksCompleted: number;
  dailySetsCompleted: number;
  activityStreak: number;
  totalExp: number;
};

type StatsTrackerProps = {
  stats: TrackerStats;
};

const TRACKER_CONFIG: {
  key: keyof TrackerStats;
  label: string;
  Icon: IconType;
}[] = [
  { key: "tasksCompleted", label: "Tasks", Icon: FaCheckDouble },
  { key: "dailySetsCompleted", label: "Sets", Icon: FaLayerGroup },
  { key: "activityStreak", label: "Streak", Icon: FaFire },
  { key: "totalExp", label: "XP", Icon: FaStar },
];

const formatValue = (key: keyof TrackerStats, value: number) => {
  if (key === "totalExp") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
};

export const StatsTracker = ({ stats }: StatsTrackerProps) => {
  return (
    <div className="stats-tracker">
      {TRACKER_CONFIG.map(({ key, label, Icon }) => (
        <div className="stats-tracker__item" key={key}>
          <span className="stats-tracker__item-icon">
            <Icon size={14} />
          </span>
          <span className="stats-tracker__item-value">
            {formatValue(key, stats[key])}
          </span>
          <span className="stats-tracker__item-name">{label}</span>
        </div>
      ))}
    </div>
  );
};

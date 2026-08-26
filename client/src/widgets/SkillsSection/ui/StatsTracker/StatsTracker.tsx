import { Stats } from "@/entities/stats";
import "./StatsTracker.scss";
import type { IconType } from "react-icons";
import {
  FaCheckDouble,
  FaStar,
  FaStopwatch,
  FaTrophy,
} from "react-icons/fa";

interface StatsTrackerProps {
  stats?: Stats;
}

const TRACKER_CONFIG: Record<
  keyof Stats,
  { label: string; Icon: IconType }
> = {
  tasksCompleted: { label: "Tasks", Icon: FaCheckDouble },
  questsCompleted: { label: "Quests", Icon: FaTrophy },
  focusMinutes: { label: "Focus", Icon: FaStopwatch },
  pointsEarned: { label: "Points", Icon: FaStar },
};

const formatValue = (key: keyof Stats, value: number) => {
  if (key === "focusMinutes") {
    return `${Math.floor(value / 60)}h ${value % 60}m`;
  }
  return String(value);
};

export const StatsTracker = ({ stats }: StatsTrackerProps) => {
  if (!stats) {
    return <div className="stats-tracker">Нет данных</div>;
  }

  return (
    <div className="stats-tracker">
      {(Object.keys(TRACKER_CONFIG) as (keyof Stats)[]).map((key) => {
        const { label, Icon } = TRACKER_CONFIG[key];
        return (
          <div className="stats-tracker__item" key={key}>
            <span className="stats-tracker__item-icon">
              <Icon size={14} />
            </span>
            <span className="stats-tracker__item-value">
              {formatValue(key, stats[key])}
            </span>
            <span className="stats-tracker__item-name">{label}</span>
          </div>
        );
      })}
    </div>
  );
};

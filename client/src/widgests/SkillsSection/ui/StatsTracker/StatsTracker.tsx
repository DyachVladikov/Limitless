import { Stats } from "@/entities/stats";
import "./StatsTracker.scss";
import { formatCamelCase } from "@/shared/lib/string";
import { BiCalendar } from "react-icons/bi";

interface StatsTrackerProps {
  stats?: Stats;
}

export const StatsTracker = ({ stats }: StatsTrackerProps) => {
  if (!stats) {
    return <div>No data</div>;
  }

  return (
    <div className="stats-tracker">
      {Object.entries(stats).map(([key, value]) => {
        const statName = formatCamelCase(key);
        return (
          <div className="stats-tracker__item" key={key}>
            <BiCalendar className="stats-tracker__item-icon" size={40} />
            <h2 className="stats-tracker__item-value">{value}</h2>
            <span className="stats-tracker__item-name">{statName}</span>
          </div>
        );
      })}
    </div>
  );
};

import { Quests } from "@/entities/quests";
import { getQuestIcon } from "@/shared/lib/questIcons";
import classNames from "classnames";
import "./Quest.scss";

interface QuestProps {
  quest: Quests;
}

export const Quest = ({ quest }: QuestProps) => {
  const { title, description, icon, rewardXp, targetCount, progress, completedAt } =
    quest;
  const isCompleted = Boolean(completedAt);

  const Icon = getQuestIcon(icon ?? "star");
  const ratio = Math.min(progress / targetCount, 1);

  return (
    <div className={classNames("quest", { completed: isCompleted })}>
      <span className="quest__icon">
        <Icon size={16} />
      </span>
      <div className="quest__body">
        <div className="quest__row">
          <h4 className="quest__title">{title}</h4>
          <span className="quest__progress-text">
            {progress} / {targetCount}
          </span>
          <span className="quest__exp">+{rewardXp} XP</span>
        </div>
        <p className="quest__description">{description}</p>
        <div className="quest__bar">
          <div
            className="quest__bar-inner"
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};

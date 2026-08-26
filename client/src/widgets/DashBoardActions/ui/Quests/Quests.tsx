import { Quests as QuestType } from "@/entities/quests";
import "./Quests.scss";
import { Quest } from "@/widgets/DashBoardActions/ui/Quest";

interface QuestsProps {
  quests?: QuestType[];
}

export const Quests = ({ quests }: QuestsProps) => {
  if (!quests) {
    return <div className="quests">Загрузка...</div>;
  }

  return (
    <div className="quests widget">
      <div className="quests__header">
        <h3 className="quests__title">
          <span className="quests__title-diamond" />
          Quests
        </h3>
        <span className="quests__counter">{quests.length} active</span>
      </div>
      <ul className="quests__list">
        {quests.map((quest) => (
          <li className="quests__list-item" key={quest.id}>
            <Quest quest={quest} />
          </li>
        ))}
      </ul>
    </div>
  );
};

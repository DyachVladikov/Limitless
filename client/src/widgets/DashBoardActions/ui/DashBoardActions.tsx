import { useTodayTasks } from "@/entities/dailyTasks";
import "./DashBoardActions.scss";
import { Tasks } from "./Tasks";
import { useClosestQuests, useQuests } from "@/entities/quests";
import { Quests } from "./Quests/Quests";
import { FocusModal } from "@/widgets/FocusModal";

export const DashBoardActions = () => {
  const { data: tasks } = useTodayTasks();
  const { data: quests } = useQuests();
  return (
    <section className="dash-board-actions">
      <Tasks tasks={tasks} />
      <Quests quests={quests} />
      <FocusModal />
    </section>
  );
};

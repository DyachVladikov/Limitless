import { DailyTask as DailyTaskType } from "@/entities/dailyTasks";
import "./Tasks.scss";
import { DailyTask } from "@/features";

interface TasksProps {
  tasks?: DailyTaskType[];
}

export const Tasks = ({ tasks }: TasksProps) => {
  if (!tasks) {
    return <div className="tasks">Загрузка...</div>;
  }

  const completedCount = tasks.filter((task) => task.completedAt).length;

  return (
    <div className="tasks widget">
      <div className="tasks__header">
        <h3 className="tasks__title">
          <span className="tasks__title-diamond" />
          Daily Tasks
        </h3>
        <span className="tasks__counter">
          {completedCount} / {tasks.length}
        </span>
      </div>
      <ul className="tasks__list">
        {tasks.map((task) => (
          <li className="tasks__list-item" key={task.id}>
            <DailyTask task={task} />
          </li>
        ))}
      </ul>
    </div>
  );
};

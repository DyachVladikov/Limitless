import { DailyTask as DailyTaskType } from "@/entities/dailyTasks";
import "./DailyTask.scss";
import { CustomCheckbox } from "@/shared/CheckBox";
import { ChangeEvent, useState } from "react";
import classNames from "classnames";
import { Badge } from "@/shared/Badge";
import { getCategoryColor } from "@/shared/lib/GetCategoryColor";
import { useToggleTask } from "@/entities/dailyTasks/api/TasksApi";

interface dailyTaskProps {
  task: DailyTaskType;
}

export const DailyTask = ({ task }: dailyTaskProps) => {
  const { title, description, rewardXp, category, completedAt } = task;
  const isCompleted = Boolean(completedAt);

  const [isCheckBoxChecked, setIsCheckBoxChecked] = useState(isCompleted);

  const { mutate: toggleTask } = useToggleTask();
  const handlerCheckBox = (e: ChangeEvent<HTMLInputElement>) => {
    setIsCheckBoxChecked((prev) => !prev);
    if (isCheckBoxChecked) {
      toggleTask(task);
    }
    if (!isCheckBoxChecked) {
      toggleTask({ ...task, completedAt: null });
    }
  };

  const badgeColor = getCategoryColor(category);

  return (
    <div
      className={classNames("daily-tasks", {
        completed: isCheckBoxChecked,
      })}
    >
      <div className="daily-tasks__main">
        <CustomCheckbox
          onChange={handlerCheckBox}
          checked={isCheckBoxChecked}
        />
        <h4 className="daily-tasks__label">{title}</h4>
        <Badge text={category} color={badgeColor} />
        <span className="daily-tasks__exp">+{rewardXp} XP</span>
      </div>
      <p className="daily-tasks__description">{description}</p>
    </div>
  );
};

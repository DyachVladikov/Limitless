import {
  DailyTask as DailyTaskType,
  useToggleTask,
} from "@/entities/dailyTasks";
import "./DailyTask.scss";
import { CustomCheckbox } from "@/shared/CheckBox";
import { ChangeEvent, useState } from "react";
import classNames from "classnames";
import { Badge } from "@/shared/Badge";
import { getCategoryColor } from "@/shared/lib/GetCategoryColor";

interface dailyTaskProps {
  task: DailyTaskType;
}

export const DailyTask = ({ task }: dailyTaskProps) => {
  const { title, description, exp, category, isCompleted } = task;

  const [isCheckBoxChecked, setIsCheckBoxChecked] = useState(isCompleted);
  const toggle = useToggleTask();

  const handlerCheckBox = (e: ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setIsCheckBoxChecked(checked);
    toggle.mutate(task);
  };

  const badgeColor = getCategoryColor(category);

  return (
    <div
      className={classNames("daily-tasks", {
        completed: isCompleted,
      })}
    >
      <div className="daily-tasks__main">
        <CustomCheckbox onChange={handlerCheckBox} checked={isCheckBoxChecked} />
        <h4 className="daily-tasks__label">{title}</h4>
        <Badge text={category} color={badgeColor} />
        <span className="daily-tasks__exp">+{exp} XP</span>
      </div>
      <p className="daily-tasks__description">{description}</p>
    </div>
  );
};

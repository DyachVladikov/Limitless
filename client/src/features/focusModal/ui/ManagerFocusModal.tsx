import { useDispatch } from "react-redux";
import { FaPause, FaPlay } from "react-icons/fa";
import classNames from "classnames";
import { useAppSelector } from "@/app/hooks/useAppStore";
import { toggleTimer } from "../model/FocusModalSlice";
import "./ManagerFocusModal.scss";

interface ManagerFocusModalProps {
  mini?: boolean;
}

export const ManagerFocusModal = (props: ManagerFocusModalProps) => {
  const { mini = false } = props;
  const dispatch = useDispatch();
  const { isActive } = useAppSelector((state) => state.focusModal);

  return (
    <button
      type="button"
      onClick={() => dispatch(toggleTimer())}
      className={classNames("focus-toggle", { "focus-toggle--mini": mini })}
      title={isActive ? "Пауза" : "Старт"}
    >
      {isActive ? <FaPause /> : <FaPlay className="focus-toggle__play-icon" />}
    </button>
  );
};

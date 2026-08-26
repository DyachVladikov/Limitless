import { FaCheck } from "react-icons/fa";
import "./CheckBox.scss";
import { ChangeEvent } from "react";
import classNames from "classnames";

interface CheckBoxProps {
  label?: string;
  checked: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

export const CustomCheckbox = ({ label, checked, onChange }: CheckBoxProps) => {
  return (
    <label className="check-box__wrapper">
      <input
        type="checkbox"
        className="check-box__wrapper-hiddenInput"
        checked={checked}
        onChange={onChange}
      />

      <span className="check-box__wrapper-custom">
        <FaCheck
          className={classNames("check-box__wrapper-custom-icon", {
            checked: checked,
          })}
        />
      </span>

      <span className="check-box__wrapper-label">{label}</span>
    </label>
  );
};

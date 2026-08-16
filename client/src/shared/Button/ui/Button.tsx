import "./Button.scss";
import classNames from "classnames";

type BaseButtonProps = {
  className: string;
  label?: string;
  title?: string;
};
type WithoutIcon = BaseButtonProps & {
  hasIconBefore?: false;
  hasIconAfter?: false;
  onlyIcon?: false;
  icon?: never;
};

type IconFlags =
  | { hasIconBefore: true; hasIconAfter?: boolean; onlyIcon?: boolean }
  | { hasIconAfter: true; hasIconBefore?: boolean; onlyIcon?: boolean }
  | { onlyIcon: true; hasIconBefore?: boolean; hasIconAfter?: boolean };

type WithIcon = BaseButtonProps &
  IconFlags & {
    icon: React.ReactNode;
  };

export type ButtonProps = WithoutIcon | WithIcon;

export const Button = (props: ButtonProps) => {
  const {
    className,
    hasIconBefore = false,
    hasIconAfter = false,
    onlyIcon = false,
    label,
    title,
    icon,
  } = props;
  return (
    <>
      {hasIconBefore && { icon }}
      <div
        className={classNames("button", className, {
          "button--only-icon": onlyIcon,
        })}
        aria-label={label}
      >
        <button className="btn">
          {onlyIcon && <>{icon}</>}
          {!onlyIcon && <span>{title}</span>}
        </button>
      </div>
      {hasIconAfter && { icon }}
    </>
  );
};

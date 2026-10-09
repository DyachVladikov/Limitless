import "./Button.scss";
import classNames from "classnames";

type BaseButtonProps = {
  className: string;
  label?: string;
  title?: string;
  onClick?: () => void;
};
type WithoutIcon = BaseButtonProps & {
  hasIconBefore?: false;
  hasIconAfter?: false;
  onlyIcon?: false;
  icon?: never;
  hoveredIcon?: never;
};

type IconFlags =
  | { hasIconBefore: true; hasIconAfter?: boolean; onlyIcon?: boolean }
  | { hasIconAfter: true; hasIconBefore?: boolean; onlyIcon?: boolean }
  | { onlyIcon: true; hasIconBefore?: boolean; hasIconAfter?: boolean };

type WithIcon = BaseButtonProps &
  IconFlags & {
    icon: React.ReactNode;
    hoveredIcon?: boolean;
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
    onClick,
    hoveredIcon = false,
  } = props;
  return (
    <>
      {hasIconBefore && { icon }}
      <div
        className={classNames(
          "button",
          className,
          {
            "button--only-icon": onlyIcon,
          },
          {
            hovered: hoveredIcon,
          },
        )}
        aria-label={label}
      >
        <button className="btn" onClick={() => onClick?.()}>
          {onlyIcon && <>{icon}</>}
          {!onlyIcon && <span>{title}</span>}
        </button>
      </div>
      {hasIconAfter && { icon }}
    </>
  );
};

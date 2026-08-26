import { CSSProperties } from "react";
import "./Badge.scss";

interface BadgeProps {
  text: string;
  color?: string;
}

export const Badge = (props: BadgeProps) => {
  const { text, color = "#8f8fb8" } = props;
  return (
    <div
      className="badge"
      style={{ "--badge-color": color } as CSSProperties}
    >
      <span className="badge__text">{text}</span>
    </div>
  );
};

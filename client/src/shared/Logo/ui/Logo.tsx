import "./Logo.scss";
import React from "react";

interface InfinityLogoProps {
  mainColor?: string; // Основной яркий цвет (например, #ff003c для красного)
  darkColor?: string; // Темный оттенок для градиента (например, #8b0000)
  className?: string;
  width?: number | string;
  height?: number | string;
}

export const Logo: React.FC<InfinityLogoProps> = ({
  mainColor = "#ff003c", // Красный по умолчанию
  darkColor = "#8b0000",
  className = "",
  width = "100%",
  height = "100%",
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 500 500"
      width={width}
      height={height}
      className={className}
    >
      <defs>
        <filter id="glow-filter" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="15" result="blur" />
          <feComponentTransfer in="blur" result="glow">
            <feFuncA type="linear" slope="1.2" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <linearGradient id="dark-metal" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4a4a4a" />
          <stop offset="30%" stopColor="#111111" />
          <stop offset="50%" stopColor="#2c2c2c" />
          <stop offset="70%" stopColor="#0a0a0a" />
          <stop offset="100%" stopColor="#3b3b3b" />
        </linearGradient>

        <linearGradient id="dynamic-glow" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={darkColor} />
          <stop offset="30%" stopColor={darkColor} />
          <stop offset="70%" stopColor={mainColor} />
          <stop offset="100%" stopColor="#200000" />
        </linearGradient>
      </defs>

      <ellipse
        cx="250"
        cy="250"
        rx="150"
        ry="80"
        fill={mainColor}
        opacity="0.05"
        filter="url(#glow-filter)"
      />

      <g transform="translate(0, 0)">
        <path
          d="M 250,250 C 180,150 80,150 80,250 C 80,350 180,350 250,250 C 320,150 420,150 420,250 C 420,350 320,350 250,250 Z"
          fill="none"
          stroke="url(#dynamic-glow)"
          strokeWidth="22"
          filter="url(#glow-filter)"
          opacity="0.7"
        />

        <path
          d="M 250,250 C 180,150 80,150 80,250 C 80,350 180,350 250,250 C 320,150 420,150 420,250 C 420,350 320,350 250,250 Z"
          fill="none"
          stroke="url(#dark-metal)"
          strokeWidth="14"
        />

        <path
          d="M 250,250 C 180,150 80,150 80,250 C 80,350 180,350 250,250 C 320,150 420,150 420,250 C 420,350 320,350 250,250 Z"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.5"
          opacity="0.25"
          transform="translate(0, -2)"
        />

        <circle
          cx="250"
          cy="250"
          r="4"
          fill={mainColor}
          filter="url(#glow-filter)"
        />
        <circle cx="250" cy="250" r="2" fill="#ffffff" opacity="0.8" />
      </g>

      <circle
        cx="150"
        cy="180"
        r="1.5"
        fill={mainColor}
        opacity="0.6"
        filter="url(#glow-filter)"
      />
      <circle cx="380" cy="290" r="2" fill={darkColor} opacity="0.8" />
      <circle cx="340" cy="170" r="1" fill="#ffffff" opacity="0.3" />
      <circle
        cx="120"
        cy="310"
        r="2.5"
        fill={mainColor}
        opacity="0.4"
        filter="url(#glow-filter)"
      />
      <circle cx="280" cy="360" r="1" fill="#ffffff" opacity="0.2" />
      <circle cx="220" cy="140" r="1.5" fill={darkColor} opacity="0.7" />
    </svg>
  );
};

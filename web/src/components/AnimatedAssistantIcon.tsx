/** @jsxImportSource @emotion/react */
import React, { useEffect, useState } from "react";
import { css, keyframes } from "@emotion/react";
import SvgFileIcon from "./SvgFileIcon";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

interface Props {
  width?: number;
  height?: number;
}

// Keyframe definitions for subtle animations
const tilt = keyframes`
  0% { transform: rotate(0deg); }
  20% { transform: rotate(6deg); }
  40% { transform: rotate(0deg); }
  60% { transform: rotate(-6deg); }
  80% { transform: rotate(0deg); }
  90% { transform: rotate(2deg); }
  100% { transform: rotate(0deg); }
`;

const bob = keyframes`
  0% { transform: translateY(0); }
  30% { transform: translateY(-28px); }
  40% { transform: translateY(5px) scaleX(1.2) scaleY(0.8); }
  100% { transform: translateY(0) scaleX(1) scaleY(1); }
`;

const pulse = keyframes`
  0% { transform: scale(1) skew(0deg, 0deg);   }
  30% { transform: scale(1.18) skew(5deg, 0deg); }
  70% { transform: scale(0.9) skew(0deg, -5deg); }
  100% { transform: scale(1) skew(0deg, 0deg); }
`;

// Pre-computed animation style objects
const animationStyles = [
  css`
    animation: ${tilt} 0.75s ease-in-out forwards;
  `,
  css`
    animation: ${bob} 0.75s ease-in-out forwards;
  `,
  css`
    animation: ${pulse} 1.25s ease-in-out forwards;
  `
];

const AnimatedAssistantIcon: React.FC<Props> = ({
  width = 44,
  height = 44
}) => {
  const [styleIndex, setStyleIndex] = useState(0);
  const theme = useTheme();

  useEffect(() => {
    const interval = setInterval(() => {
      setStyleIndex(Math.floor(Math.random() * animationStyles.length));
    }, 1000 + Math.random() * 1500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      css={css`
        display: inline-block;
        ${animationStyles[styleIndex]};
      `}
    >
      <div
        className="iconWrapper"
        css={css`
          transition: transform 0.25s ease-in-out;
          width: ${width}px;
          height: ${height}px;
          &:hover {
            transform: scale(1.25) rotate(6deg);
          }
        `}
      >
        <SvgFileIcon
          iconName="assistant"
          svgProp={{
            width,
            height,
            opacity: 0.9,
            color: theme.palette.primary.main
          }}
        />
      </div>
    </div>
  );
};

export default AnimatedAssistantIcon;

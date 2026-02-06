/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import React from "react";

const rotate = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const dash = keyframes`
  0% {
    stroke-dasharray: 8 150;
    stroke-dashoffset: 0;
  }
  50% {
    stroke-dasharray: 90 150;
    stroke-dashoffset: -20;
  }
  100% {
    stroke-dasharray: 8 150;
    stroke-dashoffset: -120;
  }
`;

const pulse = keyframes`
  0%, 100% {
    opacity: 0.55;
    transform: scale(0.92);
  }
  50% {
    opacity: 0.95;
    transform: scale(1);
  }
`;

const styles = {
  container: css`
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 8px 0;
    min-width: 32px;
    min-height: 32px;
  `,
  svg: css`
    width: 28px;
    height: 28px;
    animation: ${rotate} 1.9s linear infinite;
    transform-origin: 50% 50%;
    will-change: transform;
  `,
  circle: css`
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    animation: ${dash} 1.55s cubic-bezier(0.42, 0, 0.28, 1) infinite;
    opacity: 0.8;
    will-change: stroke-dasharray, stroke-dashoffset;
  `,
  core: css`
    position: absolute;
    top: 50%;
    left: 50%;
    width: 6px;
    height: 6px;
    margin-left: -3px;
    margin-top: -3px;
    border-radius: 50%;
    background: currentColor;
    animation: ${pulse} 1.55s cubic-bezier(0.42, 0, 0.28, 1) infinite;
    will-change: transform, opacity;
  `,
  wrapper: css`
    position: relative;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
  `,
};

export const LoadingIndicator: React.FC = () => {
  return (
    <div css={styles.container} className="loading-container">
      <div css={styles.wrapper}>
        <svg css={styles.svg} viewBox="0 0 28 28">
          <circle css={styles.circle} cx="14" cy="14" r="10" />
        </svg>
        <div css={styles.core} />
      </div>
    </div>
  );
};

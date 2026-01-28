/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import React from "react";

const rotate = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const dash = keyframes`
  0% { stroke-dashoffset: 200; }
  50% { stroke-dashoffset: 50; }
  100% { stroke-dashoffset: 200; }
`;

const pulse = keyframes`
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
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
    animation: ${rotate} 3s linear infinite;
  `,
  circle: css`
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-dasharray: 150;
    stroke-dashoffset: 200;
    animation: ${dash} 1.5s ease-in-out infinite;
    opacity: 0.8;
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
    animation: ${pulse} 1.5s ease-in-out infinite;
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

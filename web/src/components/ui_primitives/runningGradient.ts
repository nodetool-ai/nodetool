import { keyframes } from "@emotion/react";

/** The rotating gradient used by running nodes and rendering media. */
export const runningGradientAnimation = keyframes`
  from { --gradient-angle: 90deg; }
  to { --gradient-angle: 450deg; }
`;

export const runningGradientBackground = (colors: readonly string[]): string =>
  `conic-gradient(from var(--gradient-angle), ${colors.join(", ")}, ${colors[0]})`;

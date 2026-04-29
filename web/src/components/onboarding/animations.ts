import { keyframes } from "@emotion/react";

export const hintPop = keyframes`
  from {
    opacity: 0;
    transform: translate(var(--hint-x, -50%), calc(var(--hint-y, 0) + 12px)) scale(0.92);
  }
  to {
    opacity: 1;
    transform: translate(var(--hint-x, -50%), var(--hint-y, 0)) scale(1);
  }
`;

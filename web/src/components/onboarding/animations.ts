import { keyframes } from "@emotion/react";

export const fadeInBackdrop = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

export const fadeOutBackdrop = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

export const screenEnter = keyframes`
  from {
    opacity: 0;
    transform: translateY(24px) scale(0.96);
    filter: blur(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
`;

export const screenExit = keyframes`
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
  to {
    opacity: 0;
    transform: translateY(-16px) scale(0.98);
    filter: blur(6px);
  }
`;

export const illustrationFloat = keyframes`
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50% { transform: translateY(-10px) rotate(2deg); }
`;

export const illustrationGlow = keyframes`
  0%, 100% {
    filter: drop-shadow(0 0 16px rgba(120, 200, 255, 0.45));
  }
  50% {
    filter: drop-shadow(0 0 32px rgba(180, 130, 255, 0.7));
  }
`;

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

export const pulseRing = keyframes`
  0% {
    box-shadow: 0 0 0 0 rgba(120, 200, 255, 0.6),
                0 0 0 8px rgba(120, 200, 255, 0.25);
  }
  70% {
    box-shadow: 0 0 0 12px rgba(120, 200, 255, 0),
                0 0 0 24px rgba(120, 200, 255, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(120, 200, 255, 0),
                0 0 0 8px rgba(120, 200, 255, 0);
  }
`;

export const arrowBounce = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(6px); }
`;

export const checkmarkDraw = keyframes`
  from {
    stroke-dashoffset: 60;
    opacity: 0;
  }
  to {
    stroke-dashoffset: 0;
    opacity: 1;
  }
`;

export const ANIMATION_DURATIONS = {
  screenEnter: 420,
  screenExit: 240,
  hintPop: 320,
  fadeBackdrop: 280
} as const;

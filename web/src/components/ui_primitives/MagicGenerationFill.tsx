/** @jsxImportSource @emotion/react */
/**
 * MagicGenerationFill
 *
 * The one "AI is generating this right now" effect. Every surface that shows
 * media being generated renders it: the sketch canvas (over a generating
 * layer's bounds) and its layers-panel thumbnail, timeline clips and the
 * preview compositor, storyboard shot cards, chat's media placeholder grid and
 * the setup contact sheet.
 *
 * The effect is a set of translucent radial colour blooms that orbit and
 * breathe, a soft radial glow pulsing from the centre, and a few twinkling
 * sparkles. `framed` adds a colour-cycling border and aura for surfaces with
 * no border of their own (the sketch canvas).
 *
 * The fill positions and clips itself: it covers its nearest positioned
 * ancestor edge to edge, so the parent only needs `position: relative`. Pass
 * the parent's `borderRadius` so the blooms clip to the same shape. Content
 * underneath stays visible through the wash. Motion stops under
 * prefers-reduced-motion and the static blooms remain.
 */

import { css, keyframes } from "@emotion/react";
import { memo } from "react";

import { BORDER_RADIUS, MOTION, reducedMotion } from "./tokens";

const bloomOrbit = keyframes`
  0%   { transform: rotate(0deg) scale(1); }
  50%  { transform: rotate(180deg) scale(1.15); }
  100% { transform: rotate(360deg) scale(1); }
`;

const bloomOrbitReverse = keyframes`
  0%   { transform: rotate(360deg) scale(1.1); }
  50%  { transform: rotate(180deg) scale(0.95); }
  100% { transform: rotate(0deg) scale(1.1); }
`;

const corePulse = keyframes`
  0%, 100% { opacity: 0.35; transform: scale(0.8); }
  50%      { opacity: 0.8; transform: scale(1.1); }
`;

const sparkleTwinkle = keyframes`
  0%, 100% { opacity: 0; transform: scale(0.3); }
  50%      { opacity: 1; transform: scale(1); }
`;

const borderFlow = keyframes`
  0%   { border-color: rgba(110, 231, 255, 0.9); }
  33%  { border-color: rgba(168, 85, 247, 0.9); }
  66%  { border-color: rgba(236, 72, 153, 0.9); }
  100% { border-color: rgba(110, 231, 255, 0.9); }
`;

const auraPulse = keyframes`
  0%, 100% {
    box-shadow:
      0 0 0 1.5px rgba(167, 139, 250, 0.6),
      0 0 16px 2px rgba(99, 102, 241, 0.4);
  }
  50% {
    box-shadow:
      0 0 0 2px rgba(110, 231, 255, 0.85),
      0 0 34px 6px rgba(168, 85, 247, 0.55);
  }
`;

const rootCss = css({
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
  isolation: "isolate",
  containerType: "size"
});

const framedCss = css({
  boxSizing: "border-box",
  border: "2px solid rgba(110, 231, 255, 0.9)",
  animation: `${borderFlow} 3s linear infinite, ${auraPulse} ${MOTION.pulse} infinite`,
  ...reducedMotion({ animation: "none" })
});

// The bloom layers are squares twice the host's longer side, centred on it,
// so rotating them never exposes a corner, even on a wide timeline clip.
const bloomBase = {
  position: "absolute",
  top: "50%",
  left: "50%",
  width: "200cqmax",
  height: "200cqmax",
  margin: "-100cqmax 0 0 -100cqmax",
  mixBlendMode: "screen"
} as const;

const bloomCss = css({
  ...bloomBase,
  background: [
    "radial-gradient(circle at 30% 30%, rgba(110, 231, 255, 0.55), transparent 28%)",
    "radial-gradient(circle at 70% 35%, rgba(168, 85, 247, 0.5), transparent 30%)",
    "radial-gradient(circle at 40% 72%, rgba(236, 72, 153, 0.45), transparent 28%)",
    "radial-gradient(circle at 68% 68%, rgba(99, 102, 241, 0.5), transparent 30%)"
  ].join(", "),
  animation: `${bloomOrbit} 7s ease-in-out infinite`,
  ...reducedMotion({ animation: "none" })
});

const bloomReverseCss = css({
  ...bloomBase,
  background: [
    "radial-gradient(circle at 60% 25%, rgba(99, 102, 241, 0.4), transparent 26%)",
    "radial-gradient(circle at 25% 60%, rgba(110, 231, 255, 0.35), transparent 26%)",
    "radial-gradient(circle at 75% 75%, rgba(168, 85, 247, 0.4), transparent 26%)"
  ].join(", "),
  animation: `${bloomOrbitReverse} 11s ease-in-out infinite`,
  ...reducedMotion({ animation: "none" })
});

const coreCss = css({
  position: "absolute",
  inset: 0,
  background:
    "radial-gradient(ellipse at center, rgba(255, 255, 255, 0.35), rgba(168, 85, 247, 0.15) 35%, transparent 65%)",
  animation: `${corePulse} 2.4s ease-in-out infinite`,
  ...reducedMotion({ animation: "none", opacity: 0.4 })
});

const sparkleCss = css({
  position: "absolute",
  width: 6,
  height: 6,
  borderRadius: BORDER_RADIUS.circle,
  background:
    "radial-gradient(circle, #fff 0%, rgba(110, 231, 255, 0.9) 40%, transparent 70%)",
  animation: `${sparkleTwinkle} ${MOTION.pulse} infinite`,
  ...reducedMotion({ animation: "none", opacity: 0 })
});

const SPARKLES = [
  { top: "14%", left: "16%", delay: "0s" },
  { top: "22%", left: "80%", delay: "0.3s" },
  { top: "72%", left: "24%", delay: "0.6s" },
  { top: "64%", left: "74%", delay: "0.15s" },
  { top: "44%", left: "52%", delay: "0.45s" }
] as const;

export interface MagicGenerationFillProps {
  /** Corner radius of the host, so the blooms clip to its shape. */
  borderRadius?: number | string;
  /** Stacking order within the host. */
  zIndex?: number;
  /** Adds a colour-cycling border and aura around the fill. */
  framed?: boolean;
  "data-testid"?: string;
}

const MagicGenerationFill = ({
  borderRadius,
  zIndex,
  framed = false,
  "data-testid": testId
}: MagicGenerationFillProps) => (
  <span
    aria-hidden
    className="magic-generation-fill"
    data-testid={testId}
    css={framed ? [rootCss, framedCss] : rootCss}
    style={{ borderRadius, zIndex }}
  >
    <span css={bloomCss} />
    <span css={bloomReverseCss} />
    <span css={coreCss} />
    {SPARKLES.map((s) => (
      <span
        key={`${s.top}-${s.left}`}
        css={sparkleCss}
        style={{ top: s.top, left: s.left, animationDelay: s.delay }}
      />
    ))}
  </span>
);

export default memo(MagicGenerationFill);

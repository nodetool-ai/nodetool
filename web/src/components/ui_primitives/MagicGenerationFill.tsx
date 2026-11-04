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
 * drift slowly behind a faint, steady central glow. `framed` adds a
 * subtle border for surfaces with no border of their own
 * (the sketch canvas).
 *
 * The fill positions and clips itself: it covers its nearest positioned
 * ancestor edge to edge, so the parent only needs `position: relative`. Pass
 * the parent's `borderRadius` so the blooms clip to the same shape. Content
 * underneath stays visible through the wash. Motion stops under
 * prefers-reduced-motion and the static blooms remain.
 */

import { css, keyframes } from "@emotion/react";
import { memo } from "react";

import { reducedMotion } from "./tokens";

const bloomOrbit = keyframes`
  0%   { transform: rotate(0deg) scale(1); }
  50%  { transform: rotate(180deg) scale(1.03); }
  100% { transform: rotate(360deg) scale(1); }
`;

const bloomOrbitReverse = keyframes`
  0%   { transform: rotate(360deg) scale(1.02); }
  50%  { transform: rotate(180deg) scale(0.98); }
  100% { transform: rotate(0deg) scale(1.02); }
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
  border: "2px solid rgba(110, 231, 255, 0.3)"
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
  mixBlendMode: "screen",
  opacity: 0.3
} as const;

const bloomCss = css({
  ...bloomBase,
  background: [
    "radial-gradient(circle at 30% 30%, rgba(110, 231, 255, 0.55), transparent 28%)",
    "radial-gradient(circle at 70% 35%, rgba(168, 85, 247, 0.5), transparent 30%)",
    "radial-gradient(circle at 40% 72%, rgba(236, 72, 153, 0.45), transparent 28%)",
    "radial-gradient(circle at 68% 68%, rgba(99, 102, 241, 0.5), transparent 30%)"
  ].join(", "),
  animation: `${bloomOrbit} 24s ease-in-out infinite`,
  ...reducedMotion({ animation: "none" })
});

const bloomReverseCss = css({
  ...bloomBase,
  background: [
    "radial-gradient(circle at 60% 25%, rgba(99, 102, 241, 0.4), transparent 26%)",
    "radial-gradient(circle at 25% 60%, rgba(110, 231, 255, 0.35), transparent 26%)",
    "radial-gradient(circle at 75% 75%, rgba(168, 85, 247, 0.4), transparent 26%)"
  ].join(", "),
  animation: `${bloomOrbitReverse} 36s ease-in-out infinite`,
  ...reducedMotion({ animation: "none" })
});

const coreCss = css({
  position: "absolute",
  inset: 0,
  background:
    "radial-gradient(ellipse at center, rgba(255, 255, 255, 0.06), rgba(168, 85, 247, 0.04) 35%, transparent 65%)"
});

export interface MagicGenerationFillProps {
  /** Corner radius of the host, so the blooms clip to its shape. */
  borderRadius?: number | string;
  /** Stacking order within the host. */
  zIndex?: number;
  /** Adds a subtle static border around the fill. */
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
  </span>
);

export default memo(MagicGenerationFill);

/** @jsxImportSource @emotion/react */
/**
 * MagicGenerationFill
 *
 * The shared "generating" fill — a flowing translucent multi-colour wash plus a
 * diagonal shimmer sweep — that fills its positioned parent. Used everywhere a
 * surface needs to read as "AI is generating this right now": the sketch
 * canvas (over a generating layer's bounds and its layers-panel thumbnail),
 * timeline clips and the preview compositor, and chat's media-generation
 * placeholder grid. One shared visual language across all of them.
 *
 * The parent must be `position: relative` (and usually `overflow: hidden` with
 * a matching border radius so the wash clips to the shape). Content underneath
 * stays visible through the wash.
 */

import { css, keyframes } from "@emotion/react";
import { memo } from "react";

import { reducedMotion } from "./tokens";

const gradientFlow = keyframes`
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
`;

const shimmerSweep = keyframes`
  0%   { transform: translateX(-160%) skewX(-18deg); }
  100% { transform: translateX(160%) skewX(-18deg); }
`;

const tintBreathe = keyframes`
  0%, 100% { opacity: 0.65; }
  50%      { opacity: 1; }
`;

const washCss = css({
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  background:
    "linear-gradient(120deg, rgba(110, 231, 255, 0.32), rgba(99, 102, 241, 0.3), rgba(168, 85, 247, 0.32), rgba(236, 72, 153, 0.3), rgba(110, 231, 255, 0.32))",
  backgroundSize: "300% 300%",
  animation: `${gradientFlow} 4s ease infinite, ${tintBreathe} 1.8s ease-in-out infinite`,
  ...reducedMotion({ animation: "none" })
});

const shimmerCss = css({
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  background:
    "linear-gradient(110deg, transparent 35%, rgba(255, 255, 255, 0.5) 50%, transparent 65%)",
  animation: `${shimmerSweep} 1.7s ease-in-out infinite`,
  ...reducedMotion({ animation: "none", opacity: 0 })
});

const MagicGenerationFill = () => (
  <>
    <span aria-hidden css={washCss} />
    <span aria-hidden css={shimmerCss} />
  </>
);

export default memo(MagicGenerationFill);

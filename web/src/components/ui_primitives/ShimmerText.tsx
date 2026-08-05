/** @jsxImportSource @emotion/react */
/**
 * ShimmerText
 *
 * Inline text whose brightness sweeps left to right — the "working on it"
 * treatment for status labels (Thinking…, a running tool call, a loading
 * list). Inherits font and color from its parent; the sweep brightens
 * `currentColor`, so it works on any palette color.
 */

import { css, keyframes } from "@emotion/react";
import React, { memo } from "react";

import { MOTION, reducedMotion } from "./tokens";

const sweep = keyframes`
  0%   { background-position: 100% 0; }
  100% { background-position: -100% 0; }
`;

const shimmerCss = css({
  // `inline`, not `inline-block`: an atomic inline is not ellipsized, so a
  // shimmering label inside a truncating parent (the tool-call name) gets
  // hard-clipped mid-character instead of ending in `…`.
  display: "inline",
  // The dim stops stay legible on their own — the sweep is a highlight
  // passing over readable text, not a fade to near-invisible.
  background:
    "linear-gradient(90deg, color-mix(in srgb, currentColor 70%, transparent) 0%, currentColor 50%, color-mix(in srgb, currentColor 70%, transparent) 100%)",
  backgroundSize: "200% 100%",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
  animation: `${sweep} ${MOTION.pulse} infinite`,
  ...reducedMotion({
    animation: "none",
    background: "none",
    WebkitTextFillColor: "currentcolor"
  })
});

export interface ShimmerTextProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
}

export const ShimmerText = memo<ShimmerTextProps>(
  ({ children, ...rest }) => (
    <span css={shimmerCss} {...rest}>
      {children}
    </span>
  )
);
ShimmerText.displayName = "ShimmerText";

export default ShimmerText;

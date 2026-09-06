/** @jsxImportSource @emotion/react */
/**
 * ThinkingIndicator
 *
 * What a wait on a model looks like. A spinner says "busy" — true of a file
 * copy, a delete, a page load. A model is doing something narrower: reading
 * what you wrote and composing an answer a piece at a time, for tens of
 * seconds. This says that instead.
 *
 * The mark is a short row of cells with a wave travelling left to right: each
 * cell brightens and lifts as the wave reaches it, the way a stream arrives
 * token by token. It runs on `MOTION.pulse`, the breathing tier, not the
 * spinner tier — a wait of half a minute should not look frantic.
 *
 * The label, when given, is a {@link ShimmerText}, so the mark and the words
 * carry the same treatment already used for "Thinking…" in chat.
 *
 * Motion is the whole component, so `prefers-reduced-motion` gets a real
 * fallback rather than a frozen mark: the cells settle at a legible middle
 * brightness and the label stops sweeping (WCAG 2.3.3).
 */

import { css, keyframes } from "@emotion/react";
import React, { memo } from "react";

import { FlexRow } from "./FlexRow";
import { GAP } from "./spacing";
import { BORDER_RADIUS, MOTION, reducedMotion } from "./tokens";
import { ShimmerText } from "./ShimmerText";

/** Cells in the mark. Seven reads as a stream; three reads as a countdown. */
const CELL_COUNT = 7;

/** One full pass of the wave, in the same tier as every breathing indicator. */
const WAVE_DURATION = MOTION.pulse;

const wave = keyframes`
  0%, 60%, 100% {
    opacity: 0.25;
    transform: scaleY(0.55);
  }
  30% {
    opacity: 1;
    transform: scaleY(1);
  }
`;

const cellCss = (index: number, height: number) =>
  css({
    width: 3,
    height,
    borderRadius: BORDER_RADIUS.pill,
    backgroundColor: "currentColor",
    transformOrigin: "center",
    animation: `${wave} ${WAVE_DURATION} infinite`,
    // The offset per cell is what makes one wave instead of seven blinks.
    animationDelay: `${index * 0.09}s`,
    ...reducedMotion({
      animation: "none",
      opacity: 0.6,
      transform: "none"
    })
  });

export interface ThinkingIndicatorProps {
  /** What is being waited on, e.g. "Writing 6 shots". Rendered shimmering. */
  label?: React.ReactNode;
  /** Mark height in px. The label keeps its inherited size. */
  size?: number;
  /**
   * Announce the label to assistive tech. Leave off where the surrounding
   * surface already owns a live region — two announcements of one wait is
   * worse than none.
   */
  announce?: boolean;
  className?: string;
}

const ThinkingIndicatorInternal: React.FC<ThinkingIndicatorProps> = ({
  label,
  size = 14,
  announce = false,
  className
}) => (
  <FlexRow
    gap={GAP.compact}
    align="center"
    className={className}
    role={announce ? "status" : undefined}
    aria-live={announce ? "polite" : undefined}
  >
    <FlexRow
      gap={GAP.micro}
      align="center"
      aria-hidden
      sx={{ height: size }}
      data-testid="thinking-mark"
    >
      {Array.from({ length: CELL_COUNT }, (_, index) => (
        <div key={index} css={cellCss(index, size)} />
      ))}
    </FlexRow>
    {label ? <ShimmerText>{label}</ShimmerText> : null}
  </FlexRow>
);

export const ThinkingIndicator = memo(ThinkingIndicatorInternal);
ThinkingIndicator.displayName = "ThinkingIndicator";

export default ThinkingIndicator;

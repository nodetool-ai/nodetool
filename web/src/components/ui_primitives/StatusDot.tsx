/**
 * StatusDot
 *
 * A plain filled circle that carries a state by colour alone: unsaved,
 * generating, failed, connected. For a dot with a label use `SaveState` or
 * `StatusIndicator`. Tone comes from the theme palette. `pulse` breathes the
 * dot on `MOTION.pulse` and stops under `prefers-reduced-motion`.
 *
 * Decorative by default (`aria-hidden`). Pass `label` when the dot is the only
 * carrier of the state, which makes it an `img` with that name.
 *
 * @example
 * <StatusDot tone="warning" label="Unsaved changes" />
 * <StatusDot tone="primary" pulse size="medium" />
 */

import { keyframes } from "@emotion/react";
import { forwardRef } from "react";
import { Box } from "./Box";
import type { BoxProps } from "./Box";
import { SPACING, getSpacingPx } from "./spacing";
import { BORDER_RADIUS, MOTION, reducedMotion } from "./tokens";

export type StatusDotTone =
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "neutral";

export interface StatusDotProps extends Omit<BoxProps, "children"> {
  /** Palette tone. `neutral` is the secondary text colour. @default "neutral" */
  tone?: StatusDotTone;
  /** `small` is 6px, `medium` is 8px. @default "small" */
  size?: "small" | "medium";
  /** Breathe the dot to show ongoing work. @default false */
  pulse?: boolean;
  /** Accessible name. Without it the dot is hidden from assistive tech. */
  label?: string;
}

const breathe = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
`;

const TONE_COLOR: Record<StatusDotTone, string> = {
  primary: "primary.main",
  secondary: "secondary.main",
  success: "success.main",
  warning: "warning.main",
  error: "error.main",
  info: "info.main",
  neutral: "text.secondary"
};

export const StatusDot = forwardRef<HTMLSpanElement, StatusDotProps>(
  (
    { tone = "neutral", size = "small", pulse = false, label, sx, ...props },
    ref
  ) => {
    const side = getSpacingPx(size === "small" ? SPACING.sm : SPACING.md);
    return (
      <Box
        ref={ref}
        component="span"
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        sx={[
          {
            display: "inline-block",
            width: side,
            height: side,
            flexShrink: 0,
            borderRadius: BORDER_RADIUS.circle,
            bgcolor: TONE_COLOR[tone]
          },
          pulse && {
            animation: `${breathe} ${MOTION.pulse} infinite`,
            ...reducedMotion({ animation: "none" })
          },
          ...(Array.isArray(sx) ? sx : [sx])
        ]}
        {...props}
      />
    );
  }
);

StatusDot.displayName = "StatusDot";

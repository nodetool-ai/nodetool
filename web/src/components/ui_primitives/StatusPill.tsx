/**
 * StatusPill
 *
 * The one status vocabulary the app's media surfaces speak: a mono pill in the
 * corner of a thumbnail or beside a name. Four tones — a finished render
 * (success green), a render in flight (`accent`, the caller's own colour), a
 * step still waiting (neutral), and a failure (error).
 *
 * @example
 * <StatusPill tone="done">clip · 38s</StatusPill>
 * <StatusPill tone="rendering" accent={CLIP_COLOR}>rendering clip</StatusPill>
 */

import { memo, type ReactNode } from "react";
import type { SxProps, Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";

import { Box } from "./Box";
import { BORDER_RADIUS, CONTROL, TYPOGRAPHY } from "./tokens";
import { SPACING } from "./spacing";
import { hexToRgba } from "../../utils/ColorUtils";
import { brighten, toHex } from "../../utils/colorMath";

export type StatusPillTone = "done" | "rendering" | "neutral" | "failed";

export interface StatusPillProps {
  tone: StatusPillTone;
  /**
   * The colour the `rendering` tone is drawn in — the surface's own, so a clip
   * render reads as the same violet as the card border around it. Ignored by
   * every other tone.
   */
  accent?: string;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
  sx?: SxProps<Theme>;
}

/** Border and background for a tone, shared with the borders around it. */
export const statusPillColors = (
  tone: StatusPillTone,
  theme: Theme,
  accent?: string
): { color: string; border: string; background: string } => {
  switch (tone) {
    case "done": {
      const green = theme.palette.success.main;
      return {
        color: green,
        border: hexToRgba(green, 0.5),
        background: hexToRgba(green, 0.12)
      };
    }
    case "rendering": {
      const base = accent ?? theme.palette.primary.main;
      return {
        // Lifted off the tint it sits on, so the label stays readable.
        color: toHex(brighten(base, 1.4)),
        border: base,
        background: hexToRgba(base, 0.16)
      };
    }
    case "failed": {
      const red = theme.palette.error.main;
      return {
        color: red,
        border: hexToRgba(red, 0.5),
        background: hexToRgba(red, 0.12)
      };
    }
    default:
      return {
        color: theme.palette.text.secondary,
        border: theme.palette.divider,
        background: hexToRgba(theme.palette.common.white, 0.06)
      };
  }
};

const StatusPillInner = ({
  tone,
  accent,
  children,
  className,
  "data-testid": testId,
  sx
}: StatusPillProps) => {
  const theme = useTheme();
  const colors = statusPillColors(tone, theme, accent);
  return (
    <Box
      className={className}
      data-testid={testId}
      data-tone={tone}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        height: `${CONTROL.height.xs}px`,
        px: SPACING.sm,
        borderRadius: BORDER_RADIUS.pill,
        border: "1px solid",
        borderColor: colors.border,
        backgroundColor: colors.background,
        color: colors.color,
        whiteSpace: "nowrap",
        ...TYPOGRAPHY.mono.caption,
        ...sx
      }}
    >
      {children}
    </Box>
  );
};

export const StatusPill = memo(StatusPillInner);
StatusPill.displayName = "StatusPill";

/**
 * StatusPill
 *
 * The one status vocabulary the app's media surfaces speak: a mono pill in the
 * corner of a thumbnail or beside a name. Five tones — a finished render
 * (success green), a render in flight (`accent`, the caller's own colour), a
 * step still waiting (neutral), a warning, and a failure (error).
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

export type StatusPillTone =
  | "done"
  | "rendering"
  | "neutral"
  | "warning"
  | "failed";

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

/** Text, border and background for a tone. Theme tones come from CSS vars, so they follow the colour scheme. */
export const statusPillColors = (
  tone: StatusPillTone,
  theme: Theme,
  accent?: string
): { color: string; border: string; background: string; lightColor?: string } => {
  const palette = theme.vars.palette;
  const tinted = (channel: string, main: string) => ({
    color: main,
    border: `rgb(${channel} / 0.5)`,
    background: `rgb(${channel} / 0.12)`
  });
  switch (tone) {
    case "done":
      return tinted(palette.success.mainChannel, palette.success.main);
    case "rendering":
      if (accent) {
        return {
          // Lifted off the tint it sits on, so the label stays readable on
          // dark surfaces. Light surfaces read the accent as it is.
          color: toHex(brighten(accent, 1.4)),
          lightColor: accent,
          border: accent,
          background: hexToRgba(accent, 0.16)
        };
      }
      return {
        color: palette.primary.light,
        lightColor: palette.primary.main,
        border: palette.primary.main,
        background: `rgb(${palette.primary.mainChannel} / 0.16)`
      };
    case "failed":
      return tinted(palette.error.mainChannel, palette.error.main);
    case "warning":
      return tinted(palette.warning.mainChannel, palette.warning.main);
    default:
      return {
        color: palette.text.secondary,
        border: palette.divider,
        background: palette.action.hover
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
        ...(colors.lightColor && theme.applyStyles?.("light", { color: colors.lightColor })),
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

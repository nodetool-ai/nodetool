/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, CircularProgress, Typography } from "@mui/material";
import { GAP } from "./spacing";
import { TYPOGRAPHY } from "./tokens";
import { isNumber } from "../../utils/typePredicates";

type SizePreset = "small" | "medium" | "large";

/** Spinner diameter in px for each preset. */
const SPINNER_SIZE = {
  small: 20,
  medium: 32,
  large: 48
} as const satisfies Record<SizePreset, number>;

/** Small rings get a heavier stroke so they stay legible beside 14px and
 * 16px icons. */
const thicknessFor = (diameter: number): number =>
  diameter <= 16 ? 5 : diameter <= 20 ? 4 : 3.6;

const TEXT_STYLE = {
  small: TYPOGRAPHY.sans.caption,
  medium: TYPOGRAPHY.sans.label,
  large: TYPOGRAPHY.sans.body
} as const;

const styles = (theme: Theme, size: SizePreset) =>
  css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing(GAP.normal),
    ".loading-text": {
      ...TEXT_STYLE[size],
      // Suspense fallbacks can render above the ThemeProvider, where the
      // default theme has no CSS variables.
      color: theme.vars?.palette?.text?.secondary ?? theme.palette.text.secondary
    }
  });

export interface LoadingSpinnerProps {
  /** `small` (20px) in lists, rows and sidebars, `medium` (32px) to fill a
   * panel, `large` (48px) to fill a page. An `inline` spinner that stands in
   * for an icon takes that icon's size in px: 14 beside caption text or in a
   * chip, 16 in a button. Button primitives pass their own icon size. */
  size?: SizePreset | number;
  /** What is loading, in sentence case with no trailing ellipsis:
   * "Loading models". The spinner already says it is in progress. */
  text?: string;
  /** `inherit` inside a button or chip, so the ring takes the label colour. */
  color?: "primary" | "secondary" | "inherit";
  /** Render just the ring without the centered wrapper and status role, for
   * use inside buttons, chips, rows and other inline contexts. */
  inline?: boolean;
  /** Custom class name */
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = "medium",
  text,
  color = "primary",
  inline = false,
  className
}) => {
  const theme = useTheme();

  const diameter = isNumber(size) ? size : SPINNER_SIZE[size];
  const sizePreset: SizePreset = isNumber(size) ? "small" : size;

  const ring = (
    <CircularProgress
      size={diameter}
      color={color}
      thickness={thicknessFor(diameter)}
    />
  );

  if (inline) {
    return ring;
  }

  return (
    <Box
      css={styles(theme, sizePreset)}
      className={`loading-spinner ${className || ""}`}
      role="status"
      aria-live="polite"
      aria-label={text || "Loading"}
    >
      {ring}
      {text && (
        <Typography className="loading-text" variant="body2">
          {text}
        </Typography>
      )}
    </Box>
  );
};

export default LoadingSpinner;

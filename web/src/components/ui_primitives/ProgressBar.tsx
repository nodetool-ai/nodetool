/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, LinearProgress, Typography, LinearProgressProps } from "@mui/material";
import { SPACING } from "./spacing";
import { TYPOGRAPHY } from "./tokens";
import { hexToRgba } from "../../utils/ColorUtils";

/** Track height in px. `small` sits on a card edge or in a dense row. */
const BAR_HEIGHT = { small: 4, medium: 6 } as const;

const styles = (theme: Theme) =>
  css({
    width: "100%",
    ".progress-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing(SPACING.md),
      marginBottom: theme.spacing(SPACING.xs)
    },
    ".progress-label": {
      ...TYPOGRAPHY.sans.caption,
      color: theme.vars.palette.text.secondary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".progress-value": {
      ...TYPOGRAPHY.mono.caption,
      color: theme.vars.palette.text.secondary,
      flexShrink: 0,
      textAlign: "right"
    }
  });

export interface ProgressBarProps
  extends Omit<LinearProgressProps, "variant" | "value"> {
  /** Progress value (0-100) */
  value: number;
  /** What is progressing, shown above the bar and used as its accessible name */
  label?: string;
  /** Show the value above the bar */
  showValue?: boolean;
  /** Custom format for value display */
  formatValue?: (value: number) => string;
  /** Determinate when the work reports progress, indeterminate otherwise */
  progressVariant?: "determinate" | "indeterminate" | "buffer";
  /** `medium` (6px) on its own line, `small` (4px) on a card edge or in a
   * dense row. */
  size?: "small" | "medium";
  /** A surface's own colour (a clip, a node namespace) for the bar. The track
   * takes the same colour at low strength. Overrides `color`. */
  accent?: string;
  /** Custom class name */
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = memo(({
  value,
  label,
  showValue = true,
  formatValue,
  progressVariant = "determinate",
  size = "medium",
  accent,
  className,
  color = "primary",
  sx,
  ...rest
}) => {
  const theme = useTheme();
  const { t } = useTranslation();

  const displayValue = formatValue ? formatValue(value) : `${Math.round(value)}%`;

  return (
    <Box
      css={styles(theme)}
      className={`progress-bar-container ${className || ""}`}
    >
      {(label || showValue) && (
        <Box className="progress-header">
          {label && (
            <Typography className="progress-label" title={label}>
              {label}
            </Typography>
          )}
          {showValue && (
            <Typography className="progress-value">
              {displayValue}
            </Typography>
          )}
        </Box>
      )}
      <LinearProgress
        className="progress-bar"
        variant={progressVariant}
        value={value}
        color={color}
        aria-label={label || t("i18n-next91.progressBar.progress")}
        sx={[
          { height: BAR_HEIGHT[size] },
          accent
            ? {
                backgroundColor: hexToRgba(accent, 0.16),
                "& .MuiLinearProgress-bar": { backgroundColor: accent }
              }
            : {},
          ...(Array.isArray(sx) ? sx : [sx])
        ]}
        {...rest}
      />
    </Box>
  );
});

ProgressBar.displayName = "ProgressBar";

export default ProgressBar;

/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, LinearProgress, Typography, LinearProgressProps } from "@mui/material";

const styles = (theme: Theme) =>
  css({
    width: "100%",
    ".progress-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: theme.spacing(0.5)
    },
    ".progress-label": {
      fontSize: 12,
      color: theme.vars.palette.text.secondary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".progress-value": {
      fontSize: 12,
      color: theme.vars.palette.text.secondary,
      fontFamily: "monospace",
      minWidth: 40,
      textAlign: "right"
    },
    ".progress-bar": {
      borderRadius: 4,
      height: 6,
      backgroundColor: theme.vars.palette.action.hover
    }
  });

export interface ProgressBarProps extends Omit<LinearProgressProps, "variant"> {
  /** Progress value (0-100) */
  value: number;
  /** Optional label text */
  label?: string;
  /** Show percentage value */
  showValue?: boolean;
  /** Custom format for value display */
  formatValue?: (value: number) => string;
  /** Progress variant */
  progressVariant?: "determinate" | "indeterminate" | "buffer";
  /** Bar height */
  barHeight?: number;
  /** Custom class name */
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = memo(({
  value,
  label,
  showValue = true,
  formatValue,
  progressVariant = "determinate",
  barHeight = 6,
  className,
  color = "primary",
  ...rest
}) => {
  const theme = useTheme();

  const displayValue = formatValue ? formatValue(value) : `${Math.round(value)}%`;

  return (
    <Box css={styles(theme)} className={`progress-bar-container ${className || ""}`}>
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
        sx={{ height: barHeight }}
        {...rest}
      />
    </Box>
  );
});

ProgressBar.displayName = "ProgressBar";

export default ProgressBar;

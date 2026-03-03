/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import type { SxProps } from "@mui/system";

export interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  color?: "success" | "warning" | "error" | "info" | "default";
  sx?: SxProps<Theme>;
}

/**
 * WorkflowHealthMetricCard displays a single health metric with icon and styling.
 *
 * Provides consistent visual presentation for workflow health metrics
 * with support for color coding and icons.
 *
 * @example
 * ```typescript
 * <WorkflowHealthMetricCard
 *   title="Success Rate"
 *   value="95%"
 *   subtitle="Based on 20 executions"
 *   color="success"
 *   icon={<CheckCircleIcon />}
 * />
 * ```
 */
const WorkflowHealthMetricCard: React.FC<MetricCardProps> = memo(function WorkflowHealthMetricCard({
  title,
  value,
  subtitle,
  icon,
  color = "default",
  sx,
}) {
  const theme = useTheme();

  const getColor = () => {
    switch (color) {
      case "success":
        return {
          bg: theme.vars.palette.success.dark + "22",
          border: theme.vars.palette.success.main,
          text: theme.vars.palette.success.main,
        };
      case "warning":
        return {
          bg: theme.vars.palette.warning.dark + "22",
          border: theme.vars.palette.warning.main,
          text: theme.vars.palette.warning.main,
        };
      case "error":
        return {
          bg: theme.vars.palette.error.dark + "22",
          border: theme.vars.palette.error.main,
          text: theme.vars.palette.error.main,
        };
      case "info":
        return {
          bg: theme.vars.palette.info.dark + "22",
          border: theme.vars.palette.info.main,
          text: theme.vars.palette.info.main,
        };
      default:
        return {
          bg: theme.vars.palette.action.selected,
          border: theme.vars.palette.divider,
          text: theme.vars.palette.text.primary,
        };
    }
  };

  const colors = getColor();

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        p: 2,
        borderRadius: 2,
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.bg,
        transition: "all 0.2s ease",
        "&:hover": {
          backgroundColor: colors.bg + "44",
          transform: "translateY(-2px)",
          boxShadow: theme.shadows[2],
        },
        ...sx,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        {icon && (
          <Box
            sx={{
              color: colors.text,
              display: "flex",
              alignItems: "center",
            }}
          >
            {icon}
          </Box>
        )}
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {title}
        </Typography>
      </Box>
      <Typography
        variant="h4"
        sx={{
          color: colors.text,
          fontWeight: 600,
          fontSize: "1.75rem",
          lineHeight: 1.2,
        }}
      >
        {value}
      </Typography>
      {subtitle && (
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            fontSize: "0.75rem",
          }}
        >
          {subtitle}
        </Typography>
      )}
    </Box>
  );
});

export default WorkflowHealthMetricCard;

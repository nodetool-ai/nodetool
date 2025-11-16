/** @jsxImportSource @emotion/react */
import React, { useCallback } from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useTheme } from "@mui/material/styles";
import type { TooltipProps } from "@mui/material/Tooltip";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

export interface ReasoningToggleProps {
  isOpen: boolean;
  onToggle: (event?: React.MouseEvent) => void;
  showLabel?: string;
  hideLabel?: string;
  icon?: React.ReactNode;
  tooltipPlacement?: TooltipProps["placement"];
  enterDelay?: number;
  className?: string;
}

export const ReasoningToggle: React.FC<ReasoningToggleProps> = ({
  isOpen,
  onToggle,
  showLabel = "Show reasoning",
  hideLabel = "Hide reasoning",
  icon,
  tooltipPlacement = "bottom-start",
  enterDelay = TOOLTIP_ENTER_DELAY,
  className
}) => {
  const theme = useTheme();
  const labelText = isOpen ? hideLabel : showLabel;

  const handleToggle = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onToggle(event);
    },
    [onToggle]
  );

  const iconNode =
    icon ??
    React.createElement(LightbulbIcon, {
      fontSize: "inherit",
      sx: {
        color: isOpen
          ? theme.vars.palette.text.primary
          : theme.vars.palette.text.secondary
      }
    });

  return (
    <Tooltip
      title={labelText}
      enterDelay={enterDelay}
      placement={tooltipPlacement}
    >
      <Box
        className={className}
        sx={{
          display: "flex",
          alignItems: "center",
          width: "fit-content",
          gap: 1,
          px: 1,
          py: 0.5,
          cursor: "pointer",
          userSelect: "none"
        }}
        onClick={handleToggle}
      >
        <IconButton
          size="small"
          onClick={handleToggle}
          sx={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s"
          }}
          aria-label={labelText}
        >
          <ExpandMoreIcon fontSize="inherit" />
        </IconButton>
        {iconNode && (
          <Box
            component="span"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              color: isOpen
                ? theme.vars.palette.text.primary
                : theme.vars.palette.text.secondary
            }}
          >
            {iconNode}
          </Box>
        )}
      </Box>
    </Tooltip>
  );
};

export default ReasoningToggle;

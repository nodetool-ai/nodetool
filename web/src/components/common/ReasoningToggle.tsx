import React, { useCallback } from "react";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import { LabeledToggle } from "../ui_primitives";
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
  icon = <LightbulbIcon fontSize="inherit" />,
  tooltipPlacement = "bottom-start",
  enterDelay = TOOLTIP_ENTER_DELAY,
  className
}) => {
  const handleToggle = useCallback(
    (event?: React.MouseEvent) => {
      if (event) {
        event.stopPropagation();
      }
      onToggle(event);
    },
    [onToggle]
  );

  return (
    <LabeledToggle
      isOpen={isOpen}
      onToggle={handleToggle}
      showLabel={showLabel}
      hideLabel={hideLabel}
      icon={icon}
      tooltipPlacement={tooltipPlacement}
      enterDelay={enterDelay}
      className={className}
    />
  );
};

export default ReasoningToggle;

import React, { useCallback, memo } from "react";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import { LabeledToggle } from "../ui_primitives";
import type { TooltipProps } from "../ui_primitives";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useTranslation } from "react-i18next";

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

export const ReasoningToggle: React.FC<ReasoningToggleProps> = memo(({
  isOpen,
  onToggle,
  showLabel,
  hideLabel,
  icon = <LightbulbIcon fontSize="inherit" />,
  tooltipPlacement = "bottom-start",
  enterDelay = TOOLTIP_ENTER_DELAY,
  className
}) => {
  const { t } = useTranslation();
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
      showLabel={showLabel ?? t("batch2_10.reasoningToggle.show")}
      hideLabel={hideLabel ?? t("batch2_10.reasoningToggle.hide")}
      icon={icon}
      tooltipPlacement={tooltipPlacement}
      enterDelay={enterDelay}
      className={className}
    />
  );
});
ReasoningToggle.displayName = "ReasoningToggle";

export default ReasoningToggle;

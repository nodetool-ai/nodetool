import React from "react";
import HelpIcon from "@mui/icons-material/Help";
import { StateIconButton } from "../../ui_primitives";
import { Typography } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";

interface HelpModeToggleProps {
  helpMode: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

export const HelpModeToggle: React.FC<HelpModeToggleProps> = ({
  helpMode,
  onToggle,
  disabled = false
}) => {
  const tooltipContent = (
    <div style={{ textAlign: "center" }}>
      <Typography variant="inherit">
        {helpMode ? "Help Mode ON" : "Help Mode OFF"}
      </Typography>
      <Typography variant="caption" display="block">
        {helpMode
          ? "Disable Nodetool help mode for chat."
          : "Include Nodetool help context for chat."}
      </Typography>
    </div>
  );

  return (
    <StateIconButton
      icon={<HelpIcon fontSize="small" />}
      tooltip={tooltipContent}
      tooltipPlacement="top"
      onClick={() => onToggle(!helpMode)}
      disabled={disabled}
      size="small"
      isActive={helpMode}
      color={helpMode ? "primary" : "default"}
      className={`help-toggle ${helpMode ? "active" : ""}`}
      enterDelay={TOOLTIP_ENTER_DELAY}
    />
  );
};

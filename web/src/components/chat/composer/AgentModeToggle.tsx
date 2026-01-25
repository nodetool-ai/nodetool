import React from "react";
import PsychologyIcon from "@mui/icons-material/Psychology";
import { StateIconButton } from "../../ui_primitives";
import { Typography } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";

interface AgentModeToggleProps {
  agentMode: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

export const AgentModeToggle: React.FC<AgentModeToggleProps> = ({
  agentMode,
  onToggle,
  disabled = false
}) => {
  const tooltipContent = (
    <div style={{ textAlign: "center" }}>
      <Typography variant="inherit">
        {agentMode ? "Agent Mode ON" : "Agent Mode OFF"}
      </Typography>
      <Typography variant="caption" display="block">
        {agentMode ? "Disable" : "Enable"} agent mode
      </Typography>
    </div>
  );

  return (
    <StateIconButton
      icon={<PsychologyIcon fontSize="small" />}
      tooltip={tooltipContent}
      tooltipPlacement="top"
      onClick={() => onToggle(!agentMode)}
      disabled={disabled}
      size="small"
      isActive={agentMode}
      color={agentMode ? "primary" : "default"}
      className={`agent-toggle ${agentMode ? "active" : ""}`}
      enterDelay={TOOLTIP_ENTER_DELAY}
    />
  );
};

import React, { useCallback } from "react";
import PsychologyIcon from "@mui/icons-material/Psychology";
import { StateIconButton, Text, Caption } from "../../ui_primitives";

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
  const handleClick = useCallback(() => {
    onToggle(!agentMode);
  }, [agentMode, onToggle]);

  const tooltipContent = (
    <div style={{ textAlign: "center" }}>
      <Text>
        {agentMode ? "Agent Mode ON" : "Agent Mode OFF"}
      </Text>
      <Caption sx={{ display: "block" }}>
        {agentMode ? "Disable" : "Enable"} agent mode
      </Caption>
    </div>
  );

  return (
    <StateIconButton
      icon={<PsychologyIcon fontSize="small" />}
      tooltip={tooltipContent}
      tooltipPlacement="top"
      ariaLabel={agentMode ? "Disable agent mode" : "Enable agent mode"}
      onClick={handleClick}
      disabled={disabled}
      size="small"
      isActive={agentMode}
      color={agentMode ? "primary" : "default"}
      className={`agent-toggle ${agentMode ? "active" : ""}`}
    />
  );
};

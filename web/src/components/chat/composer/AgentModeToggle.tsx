import React, { memo, useCallback, useMemo } from "react";
import PsychologyIcon from "@mui/icons-material/Psychology";
import { StateIconButton } from "../../ui_primitives";
import { Typography } from "@mui/material";

interface AgentModeToggleProps {
  agentMode: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

const AgentModeToggle: React.FC<AgentModeToggleProps> = ({
  agentMode,
  onToggle,
  disabled = false
}) => {
  const handleToggle = useCallback(() => onToggle(!agentMode), [onToggle, agentMode]);

  const tooltipContent = useMemo(() => (
    <div style={{ textAlign: "center" }}>
      <Typography variant="inherit">
        {agentMode ? "Agent Mode ON" : "Agent Mode OFF"}
      </Typography>
      <Typography variant="caption" display="block">
        {agentMode ? "Disable" : "Enable"} agent mode
      </Typography>
    </div>
  ), [agentMode]);

  return (
    <StateIconButton
      icon={<PsychologyIcon fontSize="small" />}
      tooltip={tooltipContent}
      tooltipPlacement="top"
      onClick={handleToggle}
      disabled={disabled}
      size="small"
      isActive={agentMode}
      color={agentMode ? "primary" : "default"}
      className={`agent-toggle ${agentMode ? "active" : ""}`}
    />
  );
};

export default memo(AgentModeToggle);

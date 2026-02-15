import React, { memo, useCallback, useMemo } from "react";
import PsychologyIcon from "@mui/icons-material/Psychology";
import { StateIconButton } from "../../ui_primitives";
import { Typography } from "@mui/material";
import isEqual from "lodash/isEqual";

interface AgentModeToggleProps {
  agentMode: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

export const AgentModeToggle: React.FC<AgentModeToggleProps> = memo(function AgentModeToggle({
  agentMode,
  onToggle,
  disabled = false
}) {
  // Memoize tooltip content to avoid recreation on every render
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

  // Stable click handler
  const handleClick = useCallback(() => {
    onToggle(!agentMode);
  }, [agentMode, onToggle]);

  return (
    <StateIconButton
      icon={<PsychologyIcon fontSize="small" />}
      tooltip={tooltipContent}
      tooltipPlacement="top"
      onClick={handleClick}
      disabled={disabled}
      size="small"
      isActive={agentMode}
      color={agentMode ? "primary" : "default"}
      className={`agent-toggle ${agentMode ? "active" : ""}`}
    />
  );
}, isEqual);

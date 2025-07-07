/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { Tooltip, IconButton, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import PsychologyIcon from "@mui/icons-material/Psychology";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";

interface AgentModeToggleProps {
  agentMode: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

const styles = (theme: any) =>
  css({
    ".agent-toggle": {
      transition: "all 0.2s ease-in-out",
      border: "1px solid transparent"
    }
  });

export const AgentModeToggle: React.FC<AgentModeToggleProps> = ({
  agentMode,
  onToggle,
  disabled = false
}) => {
  const theme = useTheme();

  return (
    <Tooltip
      enterDelay={TOOLTIP_ENTER_DELAY}
      title={
        <div style={{ textAlign: "center" }}>
          <Typography variant="inherit">
            {agentMode ? "Agent Mode ON" : "Agent Mode OFF"}
          </Typography>
          <Typography variant="caption" display="block">
            {agentMode ? "Disable" : "Enable"} agent mode
          </Typography>
        </div>
      }
    >
      <IconButton
        className={`agent-toggle ${agentMode ? "active" : ""}`}
        css={styles(theme)}
        onClick={() => onToggle(!agentMode)}
        disabled={disabled}
        size="small"
        color={agentMode ? "primary" : "default"}
      >
        <PsychologyIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
};

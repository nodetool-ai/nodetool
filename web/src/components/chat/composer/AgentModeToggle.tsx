/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { Tooltip, IconButton, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import PsychologyIcon from "@mui/icons-material/Psychology";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";

interface AgentModeToggleProps {
  agentMode: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

const styles = (theme: any) => css({
  ".agent-toggle": {
    padding: "6px",
    transition: "all 0.2s ease-in-out",
    border: "1px solid transparent",
    
    "&.active": {
      backgroundColor: theme.palette.c_hl1 + "20",
      color: theme.palette.c_hl1,
      borderColor: theme.palette.c_hl1 + "60",
      
      "&:hover": {
        backgroundColor: theme.palette.c_hl1 + "30",
        borderColor: theme.palette.c_hl1,
      }
    },
    
    "&:not(.active)": {
      color: theme.palette.c_gray4,
      
      "&:hover": {
        color: theme.palette.c_white,
        backgroundColor: "rgba(255, 255, 255, 0.1)",
      }
    }
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
            {agentMode ? "Agent Mode On" : "Agent Mode Off"}
          </Typography>
          <Typography variant="caption" display="block">
            Click to {agentMode ? "disable" : "enable"} agent mode
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
      >
        <PsychologyIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
};
/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState, useCallback } from "react";
import {
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText
} from "@mui/material";
import { EditorButton } from "../../editor_ui";
import { Text, Caption } from "../../ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ChatIcon from "@mui/icons-material/Chat";
import PsychologyIcon from "@mui/icons-material/Psychology";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import CheckIcon from "@mui/icons-material/Check";

export type AgentMode = "chat" | "multi" | "graph";
export type AgentPlanner = "multi" | "graph";

interface AgentModeOption {
  value: AgentMode;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const AGENT_MODE_OPTIONS: AgentModeOption[] = [
  {
    value: "chat",
    label: "Chat",
    description: "Standard conversation with the model",
    icon: <ChatIcon fontSize="small" />
  },
  {
    value: "multi",
    label: "Agent (Multi-task)",
    description:
      "Plans parallel LLM tasks and executes them with tool use",
    icon: <PsychologyIcon fontSize="small" />
  },
  {
    value: "graph",
    label: "Agent (Graph builder)",
    description:
      "Builds a workflow graph from core nodes and runs it end-to-end",
    icon: <AccountTreeIcon fontSize="small" />
  }
];

const styles = (theme: Theme) =>
  css({
    ".agent-mode-button": {
      textTransform: "none",
      fontSize: "0.8125rem",
      fontWeight: 500,
      padding: "4px 10px",
      borderRadius: "var(--rounded-lg)",
      minWidth: "auto",
      gap: "4px",
      color: theme.vars.palette.grey[300],
      backgroundColor: "transparent",
      border: `1px solid transparent`,
      transition:
        "background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease",

      "&:hover": {
        backgroundColor: `${theme.vars.palette.grey[700]}40`,
        borderColor: `${theme.vars.palette.grey[600]}60`
      },

      "&.active": {
        color: theme.vars.palette.primary.main,
        backgroundColor: `${theme.vars.palette.primary.main}15`,
        borderColor: `${theme.vars.palette.primary.main}40`,

        "&:hover": {
          backgroundColor: `${theme.vars.palette.primary.main}25`,
          borderColor: `${theme.vars.palette.primary.main}60`
        }
      },

      ".mode-icon": {
        display: "flex",
        alignItems: "center",
        fontSize: "1.1rem"
      },

      ".arrow-icon": {
        fontSize: "1rem",
        opacity: 0.6,
        marginLeft: "-2px"
      }
    }
  });

const menuStyles = (theme: Theme) =>
  css({
    ".MuiPaper-root": {
      borderRadius: "var(--rounded-xl)",
      minWidth: "240px",
      backgroundColor: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.grey[700]}80`,
      boxShadow: `0 8px 32px -4px ${theme.vars.palette.grey[900]}cc`,
      backdropFilter: "blur(12px)",
      padding: "4px"
    },
    ".MuiMenuItem-root": {
      borderRadius: "var(--rounded-lg)",
      margin: "2px 0",
      padding: "8px 12px",
      gap: "10px",
      transition: "background-color 0.15s ease",

      "&:hover": {
        backgroundColor: `${theme.vars.palette.grey[700]}40`
      },

      "&.selected": {
        backgroundColor: `${theme.vars.palette.primary.main}15`,

        "&:hover": {
          backgroundColor: `${theme.vars.palette.primary.main}25`
        }
      },

      ".mode-item-icon": {
        minWidth: "auto",
        color: theme.vars.palette.grey[400]
      },

      "&.selected .mode-item-icon": {
        color: theme.vars.palette.primary.main
      },

      ".check-icon": {
        minWidth: "auto",
        marginLeft: "auto",
        color: theme.vars.palette.primary.main
      }
    }
  });

interface AgentModeSelectorProps {
  agentMode: boolean;
  onToggle: (enabled: boolean) => void;
  agentPlanner?: AgentPlanner;
  onPlannerChange?: (planner: AgentPlanner) => void;
  disabled?: boolean;
}

export const AgentModeSelector: React.FC<AgentModeSelectorProps> = ({
  agentMode,
  onToggle,
  agentPlanner = "graph",
  onPlannerChange,
  disabled = false
}) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const currentMode: AgentMode = agentMode ? agentPlanner : "chat";
  const currentOption = AGENT_MODE_OPTIONS.find(
    (o) => o.value === currentMode
  )!;

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      setAnchorEl(event.currentTarget);
    },
    []
  );

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleSelect = useCallback(
    (mode: AgentMode) => {
      if (mode === "chat") {
        onToggle(false);
      } else {
        // mode is "multi" | "graph"
        if (onPlannerChange) onPlannerChange(mode);
        onToggle(true);
      }
      setAnchorEl(null);
    },
    [onToggle, onPlannerChange]
  );

  return (
    <div css={styles(theme)}>
      <EditorButton
        className={`agent-mode-button ${agentMode ? "active" : ""}`}
        onClick={handleClick}
        disabled={disabled}
        size="small"
        aria-label={`Mode: ${currentOption.label}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="mode-icon">{currentOption.icon}</span>
        {currentOption.label}
        <KeyboardArrowDownIcon className="arrow-icon" />
      </EditorButton>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        css={menuStyles(theme)}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{
          paper: {
            elevation: 0
          }
        }}
      >
        {AGENT_MODE_OPTIONS.map((option) => {
          const isSelected = option.value === currentMode;
          return (
            <MenuItem
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className={isSelected ? "selected" : ""}
            >
              <ListItemIcon className="mode-item-icon">
                {option.icon}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Text size="small" weight={500}>
                    {option.label}
                  </Text>
                }
                secondary={
                  <Caption>
                    {option.description}
                  </Caption>
                }
              />
              {isSelected && (
                <ListItemIcon className="check-icon">
                  <CheckIcon fontSize="small" />
                </ListItemIcon>
              )}
            </MenuItem>
          );
        })}
      </Menu>
    </div>
  );
};

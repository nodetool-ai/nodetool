/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React from "react";
import { Box } from "@mui/material";
import { AgentModeToggle } from "../composer/AgentModeToggle";
import LanguageModelSelect from "./LanguageModelSelect";
import WorkflowToolsSelector from "./WorkflowToolsSelector";
import type { LanguageModel } from "../../../stores/ApiTypes";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    width: "100%",
    gap: "6px",
    flexWrap: "wrap",
    minHeight: "40px",
    padding: "6px 10px",
    borderRadius: "10px",
    background: `linear-gradient(135deg, 
      ${theme.vars.palette.grey[900]}ee 0%, 
      ${theme.vars.palette.grey[800]}cc 50%, 
      ${theme.vars.palette.grey[900]}ee 100%)`,
    backdropFilter: "blur(12px)",
    border: `1px solid ${theme.vars.palette.grey[700]}80`,
    boxShadow: `0 4px 24px -4px ${theme.vars.palette.grey[900]}4d, 
                inset 0 1px 0 ${theme.vars.palette.grey[600]}40`,
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    position: "relative",
    overflow: "hidden",

    "&::before": {
      content: '""',
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: "1px",
      background: `linear-gradient(90deg, 
        transparent 0%, 
        ${theme.vars.palette.grey[500]}60 50%, 
        transparent 100%)`,
      opacity: 0.6
    },

    "&:hover": {
      border: `1px solid ${theme.vars.palette.grey[600]}90`,
      boxShadow: `0 6px 32px -4px ${theme.vars.palette.grey[900]}66, 
                  inset 0 1px 0 ${theme.vars.palette.grey[500]}50`
    },

    // Group containers
    ".toolbar-group": {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      padding: "2px 4px",
      borderRadius: "8px",
      transition: "all 0.2s ease",

      "&:hover": {
        background: `${theme.vars.palette.grey[700]}30`
      }
    },

    ".toolbar-group-primary": {
      background: `${theme.vars.palette.grey[800]}50`,
      padding: "4px 8px",
      borderRadius: "8px",
      border: `1px solid ${theme.vars.palette.grey[700]}40`
    },

    // Divider styling
    ".toolbar-divider": {
      height: "24px",
      width: "1px",
      background: `linear-gradient(180deg, 
        transparent 0%, 
        ${theme.vars.palette.grey[600]}60 50%, 
        transparent 100%)`,
      margin: "0 6px",
      flexShrink: 0
    },

    // Spacer
    ".toolbar-spacer": {
      flex: 1,
      minWidth: "4px"
    },

    // Button styling enhancements
    "& .MuiButton-root, & .MuiIconButton-root": {
      padding: "4px 8px",
      margin: "0",
      borderRadius: "6px",
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      border: `1px solid transparent`,

      "&:hover": {
        background: `${theme.vars.palette.grey[600]}40`,
        border: `1px solid ${theme.vars.palette.grey[600]}60`,
        transform: "translateY(-1px)"
      },

      "&:active": {
        transform: "translateY(0)"
      },

      "&.active, &.Mui-selected": {
        background: `linear-gradient(135deg, 
          ${theme.vars.palette.primary.dark}30 0%, 
          ${theme.vars.palette.primary.main}20 100%)`,
        border: `1px solid ${theme.vars.palette.primary.main}60`,
        boxShadow: `0 0 12px ${theme.vars.palette.primary.main}25`
      }
    },

    // IconButton specific
    "& .MuiIconButton-root": {
      padding: "4px",

      "&.active": {
        color: theme.vars.palette.primary.main,
        background: `${theme.vars.palette.primary.main}15`,
        border: `1px solid ${theme.vars.palette.primary.main}40`
      }
    }
  });

interface ChatToolBarProps {
  selectedTools: string[];
  onToolsChange?: (tools: string[]) => void;
  selectedModel?: LanguageModel;
  onModelChange?: (model: LanguageModel) => void;
  agentMode?: boolean;
  onAgentModeToggle?: (enabled: boolean) => void;
  allowedProviders?: string[];
}

const ChatToolBar: React.FC<ChatToolBarProps> = ({
  selectedTools,
  onToolsChange,
  selectedModel,
  onModelChange,
  agentMode,
  onAgentModeToggle,
  allowedProviders
}) => {
  const theme = useTheme();

  const hasToolsSection = onToolsChange;
  const hasModelSection = onModelChange;
  const hasAgentSection = onAgentModeToggle;

  return (
    <div className="chat-tool-bar" css={styles(theme)}>
      {/* Model Selection Group */}
      {hasModelSection && (
        <Box className="toolbar-group toolbar-group-primary">
          <LanguageModelSelect
            onChange={(model) => onModelChange(model)}
            value={selectedModel}
            allowedProviders={allowedProviders}
          />
        </Box>
      )}

      {/* Visual Divider */}
      {hasModelSection && hasToolsSection && (
        <div className="toolbar-divider" />
      )}

      {/* Tools Group */}
      {hasToolsSection && (
        <Box className="toolbar-group">
          <WorkflowToolsSelector
            value={selectedTools}
            onChange={onToolsChange}
          />
        </Box>
      )}

      {/* Spacer to push agent toggle to the right */}
      <div className="toolbar-spacer" />

      {/* Agent Mode Toggle */}
      {hasAgentSection && (
        <>
          <div className="toolbar-divider" />
          <Box className="toolbar-group">
            <AgentModeToggle
              agentMode={agentMode || false}
              onToggle={onAgentModeToggle}
            />
          </Box>
        </>
      )}
    </div>
  );
};

export default ChatToolBar;

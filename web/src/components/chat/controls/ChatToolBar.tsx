/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React from "react";
import { AgentModeToggle } from "../composer/AgentModeToggle";
import WorkflowToolsSelector from "../composer/WorkflowToolsSelector";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import NodeToolsSelector from "../composer/NodeToolsSelector";
import CollectionsSelector from "../composer/CollectionsSelector";
import { LanguageModel } from "../../../stores/ApiTypes";
import { Box } from "@mui/material";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    width: "100%",
    gap: "6px",
    flexWrap: "wrap",
    minHeight: "44px",
    padding: "8px 12px",
    borderRadius: "12px",
    background: `linear-gradient(135deg, 
      ${theme.vars.palette.grey[900]}ee 0%, 
      ${theme.vars.palette.grey[800]}cc 50%, 
      ${theme.vars.palette.grey[900]}ee 100%)`,
    backdropFilter: "blur(12px)",
    border: `1px solid ${theme.vars.palette.grey[700]}80`,
    boxShadow: `0 4px 24px -4px ${theme.vars.palette.grey[900]}4d, 
                inset 0 1px 0 ${theme.vars.palette.grey[600]}40`,
    transition: "border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    position: "relative",
    overflow: "visible",

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
      transition: "background-color 0.2s ease",

      "&:hover": {
        backgroundColor: `${theme.vars.palette.grey[700]}30`
      }
    },

    ".toolbar-group-primary": {
      background: `${theme.vars.palette.grey[800]}50`,
      padding: "4px 8px",
      borderRadius: "8px",
      border: `1px solid ${theme.vars.palette.grey[700]}40`,
      transition: "background-color 0.2s ease, border-color 0.2s ease",

      "&:hover": {
        backgroundColor: `${theme.vars.palette.grey[700]}40`,
        borderColor: `${theme.vars.palette.grey[600]}60`
      }
    },

    // Divider styling
    ".toolbar-divider": {
      height: "24px",
      width: "1px",
      background: `linear-gradient(180deg, 
        transparent 0%, 
        ${theme.vars.palette.grey[600]}60 50%, 
        transparent 100%)`,
      margin: "0 8px",
      flexShrink: 0
    },

    // Spacer
    ".toolbar-spacer": {
      flex: 1,
      minWidth: "8px"
    }
  });

interface ChatToolBarProps {
  selectedTools: string[];
  onToolsChange?: (tools: string[]) => void;
  selectedModel?: LanguageModel;
  onModelChange?: (model: LanguageModel) => void;
  agentMode?: boolean;
  onAgentModeToggle?: (enabled: boolean) => void;
  selectedCollections?: string[];
  onCollectionsChange?: (collections: string[]) => void;
  allowedProviders?: string[];
  embedded?: boolean;
}

const ChatToolBar: React.FC<ChatToolBarProps> = ({
  selectedTools,
  onToolsChange,
  selectedModel,
  onModelChange,
  agentMode,
  onAgentModeToggle,
  selectedCollections,
  onCollectionsChange,
  allowedProviders,
  embedded = false
}) => {
  const theme = useTheme();

  const hasToolsSection = onToolsChange;
  const hasModelSection = onModelChange;
  const hasAgentSection = onAgentModeToggle;

  return (
    <div className={`chat-tool-bar ${embedded ? "embedded" : ""}`} css={[styles(theme), embedded && css({
      background: "transparent",
      backdropFilter: "none",
      border: "none",
      boxShadow: "none",
      padding: "0",
      minHeight: "auto",
      width: "auto",
      flex: 1,
      "&:hover": {
        border: "none",
        boxShadow: "none"
      },
      "&::before": {
        display: "none"
      }
    })]}>
      {/* Model Selection Group */}
      {hasModelSection && (
        <Box className={`toolbar-group ${!embedded ? "toolbar-group-primary" : ""}`}>
          <LanguageModelSelect
            onChange={(model) => onModelChange(model)}
            value={selectedModel?.id || ""}
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
          <NodeToolsSelector value={selectedTools} onChange={onToolsChange} />
          {onCollectionsChange && (
            <CollectionsSelector
              value={selectedCollections || []}
              onChange={onCollectionsChange}
            />
          )}
        </Box>
      )}

      {/* Spacer to push agent toggle to the right */}
      {!embedded && <div className="toolbar-spacer" />}

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

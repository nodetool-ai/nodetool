/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React from "react";
import ToolsSelector from "../composer/ToolsSelector";
import WorkflowToolsSelector from "../composer/WorkflowToolsSelector";
import { AgentModeToggle } from "../composer/AgentModeToggle";
import { HelpModeToggle } from "../composer/HelpModeToggle";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import NodeToolsSelector from "../composer/NodeToolsSelector";
import CollectionsSelector from "../composer/CollectionsSelector";
import { LanguageModel } from "../../../stores/ApiTypes";

const styles = (theme: Theme, isMobile: boolean) =>
  css({
    display: "flex",
    alignItems: "center",
    width: "100%",
    
    // Desktop layout
    ...(!isMobile && {
      gap: "8px",
      flexWrap: "wrap"
    }),
    
    // Mobile-first: tight 2-row layout
    ...(isMobile && {
      flexDirection: "column",
      gap: "6px",
      padding: "8px 12px",
      backgroundColor: theme.vars.palette.grey[800],
      borderRadius: "12px",
      border: `1px solid ${theme.vars.palette.grey[600]}`
    }),
    
    // Row styling
    ".controls-row": {
      display: "flex",
      alignItems: "center",
      width: "100%",
      gap: "6px",
      minHeight: "36px"
    },
    
    ".model-select": {
      flex: "0 0 auto"
    },
    
    ".tools-container": {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      flex: 1,
      justifyContent: "flex-end"
    },
    
    // Compact button styling for mobile
    "& .MuiButton-root, & .MuiIconButton-root": {
      padding: isMobile ? "6px 8px" : "6px",
      margin: "0",
      minHeight: isMobile ? "36px" : "auto",
      fontSize: isMobile ? "0.75rem" : "inherit",
      minWidth: isMobile ? "36px" : "auto"
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
  isMobile?: boolean;
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
  isMobile = false
}) => {
  const theme = useTheme();

  if (isMobile) {
    // Clean mobile 2-row layout
    return (
      <div className="chat-tool-bar" css={styles(theme, isMobile)}>
        {/* Row 1: Model + Tools/Controls */}
        <div className="controls-row">
          <div className="model-select">
            {onModelChange && (
              <LanguageModelSelect
                onChange={(model) => onModelChange(model)}
                value={selectedModel?.id || ""}
              />
            )}
          </div>
          
          <div className="tools-container">
            {onAgentModeToggle && (
              <AgentModeToggle
                agentMode={agentMode || false}
                onToggle={onAgentModeToggle}
              />
            )}
            {onToolsChange && (
              <>
                <WorkflowToolsSelector
                  value={selectedTools}
                  onChange={onToolsChange}
                />
                <NodeToolsSelector 
                  value={selectedTools} 
                  onChange={onToolsChange} 
                />
                {onCollectionsChange && (
                  <CollectionsSelector
                    value={selectedCollections || []}
                    onChange={onCollectionsChange}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Desktop layout (unchanged)
  return (
    <div className="chat-tool-bar" css={styles(theme, isMobile)}>
      {onModelChange && (
        <LanguageModelSelect
          onChange={(model) => onModelChange(model)}
          value={selectedModel?.id || ""}
        />
      )}
      {onToolsChange && (
        <>
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
        </>
      )}
      {onAgentModeToggle && (
        <AgentModeToggle
          agentMode={agentMode || false}
          onToggle={onAgentModeToggle}
        />
      )}
    </div>
  );
};

export default ChatToolBar;

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

const styles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    width: "100%",
    gap: "8px",
    flexWrap: "wrap",
    
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
    
    // Button styling (desktop defaults; mobile overrides in CSS)
    "& .MuiButton-root, & .MuiIconButton-root": {
      padding: "6px",
      margin: "0"
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
}

const ChatToolBar: React.FC<ChatToolBarProps> = ({
  selectedTools,
  onToolsChange,
  selectedModel,
  onModelChange,
  agentMode,
  onAgentModeToggle,
  selectedCollections,
  onCollectionsChange
}) => {
  const theme = useTheme();

  // Desktop layout (unchanged)
  return (
    <div className="chat-tool-bar" css={styles(theme)}>
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

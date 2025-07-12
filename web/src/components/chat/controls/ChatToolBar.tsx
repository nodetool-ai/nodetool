/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import React from "react";
import ToolsSelector from "../composer/ToolsSelector";
import WorkflowToolsSelector from "../composer/WorkflowToolsSelector";
import { AgentModeToggle } from "../composer/AgentModeToggle";
import { HelpModeToggle } from "../composer/HelpModeToggle";
import ModelMenu from "./ModelMenu";
import NodeToolsSelector from "../composer/NodeToolsSelector";
import CollectionsSelector from "../composer/CollectionsSelector";

const styles = () =>
  css({
    display: "flex",
    alignItems: "center",
    marginBottom: ".5em",
    gap: 0,
    "& .MuiButton-root, & .MuiIconButton-root": {
      padding: "6px",
      margin: "0"
    },
    "& .MuiButton-startIcon": {
      marginRight: "0"
    }
  });

interface ChatToolBarProps {
  selectedTools: string[];
  onToolsChange?: (tools: string[]) => void;
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
  agentMode?: boolean;
  onAgentModeToggle?: (enabled: boolean) => void;
  helpMode?: boolean;
  onHelpModeToggle?: (enabled: boolean) => void;
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
  helpMode,
  onHelpModeToggle,
  selectedCollections,
  onCollectionsChange
}) => {
  return (
    <div className="chat-tool-bar" css={styles}>
      {onModelChange && (
        <ModelMenu
          selectedModel={selectedModel}
          onModelChange={onModelChange}
        />
      )}
      {onToolsChange && (
        <>
          <ToolsSelector value={selectedTools} onChange={onToolsChange} />
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
      {onHelpModeToggle && (
        <HelpModeToggle
          helpMode={helpMode || false}
          onToggle={onHelpModeToggle}
        />
      )}
    </div>
  );
};

export default ChatToolBar;

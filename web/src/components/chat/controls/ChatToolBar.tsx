/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import ToolsSelector from "../composer/ToolsSelector";
import WorkflowToolsSelector from "../composer/WorkflowToolsSelector";
import { AgentModeToggle } from "../composer/AgentModeToggle";
import { HelpModeToggle } from "../composer/HelpModeToggle";
import ModelMenu from "./ModelMenu";
import NodeToolsSelector from "../composer/NodeToolsSelector";

const styles = (theme: any) =>
  css({
    display: "flex",
    alignItems: "center",
    marginBottom: ".5em",
    gap: ".5em"
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
}

const ChatToolBar: React.FC<ChatToolBarProps> = ({
  selectedTools,
  onToolsChange,
  selectedModel,
  onModelChange,
  agentMode,
  onAgentModeToggle,
  helpMode,
  onHelpModeToggle
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
          <WorkflowToolsSelector value={selectedTools} onChange={onToolsChange} />
          <NodeToolsSelector value={selectedTools} onChange={onToolsChange} />
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

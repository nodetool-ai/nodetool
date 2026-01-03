/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { Box } from "@mui/material";
import { AgentModeToggle } from "../composer/AgentModeToggle";
import LanguageModelSelect from "./LanguageModelSelect";
import type { LanguageModel } from "../../../stores/ApiTypes";

const toolbarStyles = css({
  display: "flex",
  alignItems: "center",
  width: "100%",
  gap: "8px",
  minHeight: "36px",
  padding: "4px 8px",
  borderRadius: "8px",
  backgroundColor: "rgba(255, 255, 255, 0.03)",
  border: "1px solid rgba(255, 255, 255, 0.06)"
});

const spacerStyles = css({
  flex: 1,
  minWidth: "4px"
});

const dividerStyles = css({
  height: "20px",
  width: "1px",
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  margin: "0 4px"
});

interface ChatToolBarProps {
  selectedModel?: LanguageModel;
  onModelChange?: (model: LanguageModel) => void;
  agentMode?: boolean;
  onAgentModeToggle?: (enabled: boolean) => void;
  allowedProviders?: string[];
}

const ChatToolBar: React.FC<ChatToolBarProps> = ({
  selectedModel,
  onModelChange,
  agentMode,
  onAgentModeToggle,
  allowedProviders
}) => {
  const hasModelSection = onModelChange;
  const hasAgentSection = onAgentModeToggle;

  return (
    <Box css={toolbarStyles}>
      {/* Model Selection */}
      {hasModelSection && (
        <LanguageModelSelect
          onChange={(model) => onModelChange(model)}
          value={selectedModel}
          allowedProviders={allowedProviders}
        />
      )}

      {/* Spacer */}
      <Box css={spacerStyles} />

      {/* Agent Mode Toggle */}
      {hasAgentSection && (
        <>
          <Box css={dividerStyles} />
          <AgentModeToggle
            agentMode={agentMode || false}
            onToggle={onAgentModeToggle}
          />
        </>
      )}
    </Box>
  );
};

export default ChatToolBar;

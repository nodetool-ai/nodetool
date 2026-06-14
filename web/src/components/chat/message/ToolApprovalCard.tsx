/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { EditorButton } from "../../editor_ui";
import { Caption, FlexColumn, FlexRow, Text } from "../../ui_primitives";
import { formatToolName } from "../../../utils/formatUtils";
import type { ApprovalDecision } from "../../../stores/GlobalChatStore";

interface ToolApprovalCardProps {
  approvalId: string;
  toolName: string;
  category: string;
  message: string;
  args: Record<string, unknown>;
  onResolve: (approvalId: string, decision: ApprovalDecision) => void;
}

const styles = (theme: Theme) =>
  css({
    border: `1px solid ${theme.vars.palette.warning.main}66`,
    borderRadius: "var(--rounded-lg)",
    background: `rgb(${theme.vars.palette.warning.mainChannel} / 0.06)`,
    padding: "12px 16px",
    ".approval-tool": {
      fontFamily: theme.fontFamily2,
      color: theme.vars.palette.grey[0]
    },
    ".approval-args": {
      margin: 0,
      padding: "8px 12px",
      borderRadius: "var(--rounded-md)",
      background: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.grey[800]}`,
      color: theme.vars.palette.grey[200],
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmall)",
      lineHeight: 1.5,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      maxHeight: 180,
      overflow: "auto"
    }
  });

/**
 * Inline approval prompt for a gated tool call. Shows the agent's message, the
 * tool name + category, and a compact view of the call arguments, with three
 * decisions: Allow (this call), Allow for this chat (session grant), Deny.
 */
const ToolApprovalCard: React.FC<ToolApprovalCardProps> = ({
  approvalId,
  toolName,
  category,
  message,
  args,
  onResolve
}) => {
  const theme = useTheme();

  const argsText = useMemo(() => {
    try {
      return JSON.stringify(args ?? {}, null, 2);
    } catch {
      return String(args);
    }
  }, [args]);

  const hasArgs = argsText !== "{}" && argsText.trim().length > 0;

  const handleAllow = useCallback(
    () => onResolve(approvalId, "allow"),
    [approvalId, onResolve]
  );
  const handleAllowForChat = useCallback(
    () => onResolve(approvalId, "allow_for_chat"),
    [approvalId, onResolve]
  );
  const handleDeny = useCallback(
    () => onResolve(approvalId, "deny"),
    [approvalId, onResolve]
  );

  return (
    <div css={styles(theme)} className="tool-approval-card" role="group">
      <FlexColumn gap={1}>
        {message && <Text size="normal">{message}</Text>}
        <FlexRow gap={0.5} align="center">
          <Text size="small" weight={600} className="approval-tool">
            {formatToolName(toolName)}
          </Text>
          <Caption size="tiny" color="secondary">
            {category}
          </Caption>
        </FlexRow>
        {hasArgs && <pre className="approval-args">{argsText}</pre>}
        <FlexRow gap={1} align="center">
          <EditorButton
            variant="contained"
            color="primary"
            density="normal"
            onClick={handleAllow}
          >
            Allow
          </EditorButton>
          <EditorButton
            variant="outlined"
            color="primary"
            density="normal"
            onClick={handleAllowForChat}
          >
            Allow for this chat
          </EditorButton>
          <EditorButton
            variant="outlined"
            color="error"
            density="normal"
            onClick={handleDeny}
          >
            Deny
          </EditorButton>
        </FlexRow>
      </FlexColumn>
    </div>
  );
};

export default memo(ToolApprovalCard);

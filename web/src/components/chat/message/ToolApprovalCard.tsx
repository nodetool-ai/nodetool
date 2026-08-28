/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { EditorButton } from "../../editor_ui";
import {
  Caption,
  CollapsibleSection,
  FlexColumn,
  FlexRow,
  Text,
  BORDER_RADIUS
} from "../../ui_primitives";
import { isString } from "../../../utils/typePredicates";
import type { ApprovalDecision } from "../../../stores/GlobalChatStore";

interface ToolApprovalCardProps {
  approvalId: string;
  toolName: string;
  category: string;
  message: string;
  /**
   * Plain-sentence account of what the call will do. A high-risk code action
   * carries one; when it is empty the card asks about `message` instead.
   */
  description?: string;
  args: Record<string, unknown>;
  onResolve: (approvalId: string, decision: ApprovalDecision) => void;
}

/** The question the card asks, by what the call is about to do. */
const QUESTIONS: Record<string, string> = {
  execute: "Run this action?",
  write: "Make this change?",
  external: "Allow this action?"
};

const styles = (theme: Theme) =>
  css({
    border: `1px solid ${theme.vars.palette.warning.main}66`,
    borderRadius: BORDER_RADIUS.lg,
    background: `rgb(${theme.vars.palette.warning.mainChannel} / 0.06)`,
    padding: theme.spacing(3, 4),
    ".approval-question": {
      color: theme.vars.palette.grey[0]
    },
    ".approval-actions": {
      marginTop: theme.spacing(1),
      button: {
        borderRadius: BORDER_RADIUS.pill,
        textTransform: "none",
        letterSpacing: 0
      },
      ".approval-deny": {
        marginLeft: "auto"
      }
    },
    ".approval-detail": {
      margin: 0,
      padding: theme.spacing(2, 3),
      borderRadius: BORDER_RADIUS.md,
      background: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.grey[800]}`,
      color: theme.vars.palette.grey[200],
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmall)",
      lineHeight: 1.5,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      maxHeight: 320,
      overflow: "auto"
    }
  });

/**
 * Inline approval prompt for a gated tool call. It asks one question — do you
 * want this done? — and answers it with the caller's own account of the call
 * (`description`, else the status message). The code and the remaining
 * arguments stay folded: a wall of unfolded JavaScript is not something a user
 * can answer yes or no to, but it has to be readable for the ones who want it.
 *
 * Three decisions: Allow (this call), Allow for this chat (session grant), Deny.
 */
const ToolApprovalCard: React.FC<ToolApprovalCardProps> = ({
  approvalId,
  category,
  message,
  description,
  args,
  onResolve
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const question = QUESTIONS[category] ?? "Allow this action?";
  const summary = description?.trim() || message;

  const code = useMemo(() => {
    const raw = args?.["code"];
    return isString(raw) && raw.trim().length > 0 ? raw : null;
  }, [args]);

  const argsText = useMemo(() => {
    const rest: Record<string, unknown> = { ...(args ?? {}) };
    delete rest["code"];
    const keys = Object.keys(rest);
    if (keys.length === 0) return null;
    try {
      return JSON.stringify(rest, null, 2);
    } catch {
      return String(rest);
    }
  }, [args]);

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
    <div
      css={cssStyles}
      className="tool-approval-card"
      role="group"
      aria-label={question}
    >
      <FlexColumn gap={1}>
        <Text size="normal" weight={600} className="approval-question">
          {question}
        </Text>
        {summary && <Text size="normal">{summary}</Text>}
        {code && (
          <CollapsibleSection
            compact
            defaultOpen={false}
            unmountOnExit
            title={
              <Caption size="small" color="secondary">
                Show code
              </Caption>
            }
          >
            <pre className="approval-detail approval-code">{code}</pre>
          </CollapsibleSection>
        )}
        {argsText && (
          <CollapsibleSection
            compact
            defaultOpen={false}
            unmountOnExit
            title={
              <Caption size="small" color="secondary">
                Show arguments
              </Caption>
            }
          >
            <pre className="approval-detail approval-args">{argsText}</pre>
          </CollapsibleSection>
        )}
        <FlexRow gap={1} align="center" className="approval-actions">
          <EditorButton
            variant="contained"
            color="primary"
            density="normal"
            onClick={handleAllow}
          >
            Allow
          </EditorButton>
          <EditorButton
            variant="text"
            color="primary"
            density="normal"
            onClick={handleAllowForChat}
          >
            Allow for this chat
          </EditorButton>
          <EditorButton
            variant="text"
            color="error"
            density="normal"
            className="approval-deny"
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

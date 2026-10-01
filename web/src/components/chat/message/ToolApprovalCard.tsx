/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import { EditorButton } from "../../editor_ui";
import {
  Caption,
  CollapsibleSection,
  FlexColumn,
  FlexRow,
  BORDER_RADIUS,
  FONT_SIZE_SANS,
  FONT_WEIGHT,
  SPACING,
  TYPOGRAPHY
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
    border: `1px solid ${theme.vars.palette.divider}`,
    borderLeft: `3px solid ${theme.vars.palette.warning.main}`,
    borderRadius: BORDER_RADIUS.lg,
    background: theme.vars.palette.background.paper,
    overflow: "hidden",
    ".approval-body": {
      padding: theme.spacing(SPACING.lg, SPACING.lg, SPACING.md)
    },
    ".approval-icon": {
      color: theme.vars.palette.warning.main,
      fontSize: FONT_SIZE_SANS.title,
      flexShrink: 0
    },
    ".approval-question": {
      ...TYPOGRAPHY.sans.body,
      fontWeight: FONT_WEIGHT.semibold,
      color: theme.vars.palette.text.primary,
      margin: 0
    },
    // The summary often ends in an ID or a path: let it break anywhere
    // rather than push the card wider than the chat column.
    ".approval-summary": {
      ...TYPOGRAPHY.sans.label,
      fontWeight: FONT_WEIGHT.normal,
      color: theme.vars.palette.text.secondary,
      margin: 0,
      overflowWrap: "anywhere"
    },
    ".approval-actions": {
      padding: theme.spacing(SPACING.md, SPACING.lg),
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      flexWrap: "wrap",
      button: {
        ...TYPOGRAPHY.sans.label,
        borderRadius: BORDER_RADIUS.pill,
        textTransform: "none",
        letterSpacing: 0
      },
      ".approval-deny": {
        marginLeft: "auto",
        color: theme.vars.palette.text.secondary,
        "&:hover": {
          color: theme.vars.palette.error.main
        }
      }
    },
    ".approval-detail": {
      ...TYPOGRAPHY.mono.code,
      margin: 0,
      padding: theme.spacing(SPACING.md, SPACING.lg),
      borderRadius: BORDER_RADIUS.md,
      background: theme.vars.palette.background.default,
      border: `1px solid ${theme.vars.palette.divider}`,
      color: theme.vars.palette.text.secondary,
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
      <FlexColumn gap={SPACING.sm} className="approval-body">
        <FlexRow gap={SPACING.md} align="center">
          <ShieldOutlinedIcon className="approval-icon" aria-hidden />
          <p className="approval-question">{question}</p>
        </FlexRow>
        {summary && <p className="approval-summary">{summary}</p>}
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
      </FlexColumn>
      <FlexRow gap={SPACING.md} align="center" className="approval-actions">
        <EditorButton
          variant="contained"
          color="primary"
          density="normal"
          disableElevation
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
          variant="text"
          color="inherit"
          density="normal"
          className="approval-deny"
          onClick={handleDeny}
        >
          Deny
        </EditorButton>
      </FlexRow>
    </div>
  );
};

export default memo(ToolApprovalCard);

/** @jsxImportSource @emotion/react */
/**
 * NodeStackRow
 *
 * Shows per-node execution status for a node in a clip's bound workflow.
 * Reads from StatusStore (running/completed status text) and ErrorStore
 * (error messages) keyed by (workflowId, nodeId).
 *
 * Inspector usage:
 *   <NodeStackRow
 *     nodeId="node-1"
 *     nodeName="Generate Video"
 *     workflowId="wf-abc"
 *     onRetry={() => ...}
 *   />
 */

import React, { memo, useCallback, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ReplayIcon from "@mui/icons-material/Replay";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ArticleIcon from "@mui/icons-material/Article";

import useStatusStore from "../../../stores/StatusStore";
import useErrorStore, {
  hasNodeError,
  nodeErrorToDisplayString
} from "../../../stores/ErrorStore";
import {
  FlexRow,
  FlexColumn,
  Caption,
  StatusIndicator,
  ToolbarIconButton
} from "../../ui_primitives";
import type { StatusType } from "../../ui_primitives/StatusIndicator";

// ── Types ──────────────────────────────────────────────────────────────────

export interface NodeStackRowProps {
  nodeId: string;
  nodeName: string;
  workflowId: string;
  /** 1-based position index in the topological order. */
  index?: number;
  /** Whether this row is currently selected in the NodeStack. */
  isSelected?: boolean;
  /** Called when the user clicks the row to select this node. */
  onClick?: () => void;
  /** Called when the user clicks the retry button. */
  onRetry?: () => void;
  /** Called when the user clicks the open-logs button. */
  onOpenLogs?: () => void;
}

// ── Styles ─────────────────────────────────────────────────────────────────

const rowStyles = (theme: Theme, isSelected: boolean) =>
  css({
    padding: theme.spacing(0.5, 1),
    borderRadius: theme.rounded.xs,
    cursor: "pointer",
    backgroundColor: isSelected
      ? theme.vars.palette.action.selected
      : undefined,
    "&:hover": {
      backgroundColor: isSelected
        ? theme.vars.palette.action.selected
        : theme.vars.palette.action.hover
    }
  });

const errorBoxStyles = (theme: Theme) =>
  css({
    margin: theme.spacing(0.5, 1, 0.5, 3),
    padding: theme.spacing(0.75, 1),
    borderRadius: theme.rounded.xs,
    backgroundColor: theme.vars.palette.error.dark + "22",
    border: `1px solid ${theme.vars.palette.error.dark}44`,
    fontSize: 11,
    color: theme.vars.palette.error.light,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: "monospace"
  });

const nodeNameStyles = css({
  fontSize: 12,
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
});

const indexStyles = (theme: Theme) =>
  css({
    fontSize: 10,
    color: theme.vars.palette.text.secondary,
    minWidth: 16,
    textAlign: "right"
  });

// ── Helpers ────────────────────────────────────────────────────────────────

function statusTypeFromNodeStatus(
  statusValue: string | Record<string, unknown> | null | undefined
): StatusType {
  if (!statusValue) {
    return "default";
  }
  const s = typeof statusValue === "string" ? statusValue.toLowerCase() : "";
  if (s === "running") {
    return "pending";
  }
  if (s === "completed") {
    return "success";
  }
  return "default";
}

// ── Component ──────────────────────────────────────────────────────────────

export const NodeStackRow: React.FC<NodeStackRowProps> = memo(
  ({ nodeId, nodeName, workflowId, index, isSelected = false, onClick, onRetry, onOpenLogs }) => {
    const theme = useTheme();

    // Node execution status from StatusStore
    const statusValue = useStatusStore((s) => s.getStatus(workflowId, nodeId));

    // Node error from ErrorStore
    const error = useErrorStore((s) => s.getError(workflowId, nodeId));
    const nodeHasError = hasNodeError(error);
    const errorMessage = nodeHasError ? nodeErrorToDisplayString(error) : "";

    const [errorExpanded, setErrorExpanded] = useState(false);

    const handleCopyError = useCallback(() => {
      if (errorMessage) {
        navigator.clipboard.writeText(errorMessage).catch(() => {
          // Clipboard access may be denied in some contexts; ignore silently.
        });
      }
    }, [errorMessage]);

    const handleToggleError = useCallback(() => {
      setErrorExpanded((prev) => !prev);
    }, []);

    const statusType = nodeHasError
      ? "error"
      : statusTypeFromNodeStatus(statusValue);

    const statusLabel =
      typeof statusValue === "string" ? statusValue : undefined;

    return (
      <FlexColumn>
        <FlexRow
          css={rowStyles(theme, isSelected)}
          align="center"
          gap={0.75}
          onClick={onClick}
          data-testid={`node-stack-row-${nodeId}`}
        >
          <StatusIndicator
            status={statusType}
            pulse={statusType === "pending"}
            size="small"
          />

          {index !== undefined && (
            <span css={indexStyles(theme)}>{index}</span>
          )}

          <span css={nodeNameStyles} title={nodeName}>
            {nodeName}
          </span>

          {statusLabel && !nodeHasError && (
            <Caption color="secondary" sx={{ fontSize: 10 }}>
              {statusLabel}
            </Caption>
          )}

          {nodeHasError && (
            <>
              <ToolbarIconButton
                icon={
                  errorExpanded ? (
                    <ExpandLessIcon fontSize="small" />
                  ) : (
                    <ExpandMoreIcon fontSize="small" />
                  )
                }
                tooltip={errorExpanded ? "Hide error" : "Show error"}
                onClick={handleToggleError}
                aria-label={errorExpanded ? "Collapse error" : "Expand error"}
                size="small"
              />

              <ToolbarIconButton
                icon={<ContentCopyIcon fontSize="small" />}
                tooltip="Copy error to clipboard"
                onClick={handleCopyError}
                aria-label="Copy error"
                size="small"
              />

              {onRetry && (
                <ToolbarIconButton
                  icon={<ReplayIcon fontSize="small" />}
                  tooltip="Retry"
                  onClick={onRetry}
                  aria-label="Retry node"
                  size="small"
                />
              )}

              {onOpenLogs && (
                <ToolbarIconButton
                  icon={<ArticleIcon fontSize="small" />}
                  tooltip="Open logs"
                  onClick={onOpenLogs}
                  aria-label="Open logs"
                  size="small"
                />
              )}
            </>
          )}
        </FlexRow>

        {nodeHasError && errorExpanded && errorMessage && (
          <div css={errorBoxStyles(theme)} role="alert" aria-label="Node error">
            {errorMessage}
          </div>
        )}
      </FlexColumn>
    );
  }
);

NodeStackRow.displayName = "NodeStackRow";

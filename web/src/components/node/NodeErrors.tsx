/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import BugReportIcon from "@mui/icons-material/BugReport";
import {
  nodeErrorToDisplayString,
  hasNodeError,
} from "../../stores/ErrorStore";
import useLogsStore, { nodeLogKey } from "../../stores/LogStore";
import { useNodeError } from "../../hooks/nodes/useNodeExecState";
import isEqual from "../../utils/isEqual";
import { CopyButton, ExternalLink, Tooltip, MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
import { VERSION, GIT_COMMIT_HASH, BUILD_NUMBER } from "../../config/constants";
import { extractKieTaskId, KIE_LOGS_URL } from "../../utils/kieTaskId";
import { useNodeStoreRef } from "../../contexts/NodeContext";
import type { NodeStoreState } from "../../stores/NodeStore";
import {
  buildReportUrl,
  type InputConnection
} from "../../utils/bugReport";

const GITHUB_ISSUE_URL =
  "https://github.com/nodetool-ai/nodetool/issues/new";

/** Gather browser / OS / build system information. */
function getSystemInfo(): string {
  const lines: string[] = [
    `Browser: ${navigator.userAgent}`,
    `Platform: ${navigator.platform}`,
    `Language: ${navigator.language}`,
    `Screen: ${window.screen.width}x${window.screen.height} (devicePixelRatio: ${window.devicePixelRatio})`,
    `NodeTool version: ${VERSION} (build ${BUILD_NUMBER}, commit ${GIT_COMMIT_HASH})`,
  ];
  return lines.join("\n");
}

/** Collect the upstream connections feeding a node from the graph state. */
function collectInputConnections(
  state: NodeStoreState,
  nodeId: string
): InputConnection[] {
  return state.edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => {
      const source = state.findNode(edge.source);
      return {
        sourceType: source?.type ?? source?.data?.originalType ?? "unknown",
        sourceTitle:
          typeof source?.data?.title === "string" ? source.data.title : undefined,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle
      };
    });
}

const errorStyles = (theme: Theme) =>
  css({
    position: "relative",
    backgroundColor: theme.vars.palette.error.main,
    borderRadius: BORDER_RADIUS.xs,
    padding: theme.spacing(3),
    transition: `background-color ${MOTION.normal}`,
    display: "flex",
    flexDirection: "column",
    width: "100%",
    maxWidth: "100%",

    ".error-text": {
      width: "100%",
      maxHeight: "18em",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[1000],
      cursor: "auto",
      userSelect: "text",
      lineHeight: "1.2em",
      padding: "0.5em .2em 0 0",
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      wordBreak: "break-word",
      overflowY: "auto",
      "&::selection": {
        backgroundColor: theme.vars.palette.grey[0]
      }
    },
    ".error-task-link": {
      marginTop: getSpacingPx(SPACING.sm),
      paddingRight: getSpacingPx(18),
    },
    ".error-actions": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.xs),
      position: "absolute",
      top: 10,
      right: 10,
    },
    ".report-button": {
      display: "inline-flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.xs),
      padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.md)}`,
      borderRadius: BORDER_RADIUS.sm,
      border: `1px solid ${theme.vars.palette.grey[1000]}44`,
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[1000],
      fontSize: theme.fontSizeSmaller,
      cursor: "pointer",
      textDecoration: "none",
      lineHeight: "1.4",
      "&:hover": {
        backgroundColor: `${theme.vars.palette.grey[1000]}22`,
      },
    },
  });

const NodeErrorsImpl: React.FC<{
  id: string;
  workflow_id: string;
  nodeType?: string;
}> = ({ id, workflow_id, nodeType = "unknown" }) => {
  const theme = useTheme();
  const memoizedErrorStyles = useMemo(() => errorStyles(theme), [theme]);
  const error = useNodeError(workflow_id, id);
  const nodeStore = useNodeStoreRef();

  const logs = useLogsStore(
    (state) => state.logsByNode[nodeLogKey(workflow_id, id)]
  );

  // Computed before the early return so the hook order stays stable
  // (rules-of-hooks). `nodeErrorToDisplayString` tolerates an absent error.
  const errorDisplay = nodeErrorToDisplayString(error);

  const handleReport = useCallback(() => {
    const logLines = (logs ?? []).map(
      (l) => `[${l.severity.toUpperCase()}] ${l.content}`
    );
    const state = nodeStore.getState();
    const node = state.findNode(id);
    const url = buildReportUrl(GITHUB_ISSUE_URL, {
      nodeType,
      nodeTitle:
        typeof node?.data?.title === "string" ? node.data.title : undefined,
      errorText: errorDisplay,
      logLines,
      systemInfo: getSystemInfo(),
      properties: node?.data?.properties,
      inputConnections: collectInputConnections(state, id)
    });
    window.open(url, "_blank", "noopener,noreferrer");
  }, [errorDisplay, logs, nodeType, nodeStore, id]);

  const kieTaskId = useMemo(
    () => extractKieTaskId(errorDisplay),
    [errorDisplay]
  );

  if (!hasNodeError(error)) {
    return null;
  }

  return (
    <div css={memoizedErrorStyles} className="node-error nodrag nowheel">
      <div className="error-actions">
        <Tooltip title="Report this issue on GitHub">
          <button
            type="button"
            className="report-button nodrag"
            onClick={handleReport}
            tabIndex={-1}
            aria-label="Report this issue on GitHub"
          >
            <BugReportIcon sx={{ fontSize: "0.9em" }} />
            Report
          </button>
        </Tooltip>
        <CopyButton
          value={errorDisplay}
          tooltip="Copy to clipboard"
          tabIndex={-1}
        />
      </div>
      <div className="error-text">{errorDisplay}</div>
      {kieTaskId ? (
        <div className="error-task-link">
          <ExternalLink
            href={KIE_LOGS_URL}
            size="small"
            iconVariant="open"
            tooltip={`Open KIE logs and search for task ${kieTaskId}`}
          >
            {kieTaskId}
          </ExternalLink>
        </div>
      ) : null}
    </div>
  );
};

export const NodeErrors = memo(NodeErrorsImpl, isEqual);
NodeErrors.displayName = "NodeErrors";
export default NodeErrors;
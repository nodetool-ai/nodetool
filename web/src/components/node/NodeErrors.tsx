/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import BugReportIcon from "@mui/icons-material/BugReport";
import ListAltIcon from "@mui/icons-material/ListAlt";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import {
  nodeErrorToDisplayString,
  hasNodeError,
} from "../../stores/ErrorStore";
import useLogsStore, { nodeLogKey } from "../../stores/LogStore";
import useWorkflowRunsStore from "../../stores/WorkflowRunsStore";
import { useBottomPanelStore } from "../../stores/BottomPanelStore";
import { useNodeError } from "../../hooks/nodes/useNodeExecState";
import { useRunInspection } from "../../hooks/useRunInspection";
import { useChatAboutNodes } from "../../hooks/nodes/useChatAboutNodes";
import isEqual from "../../utils/isEqual";
import { CopyButton, ExternalLink, MOTION, BORDER_RADIUS, SPACING, getSpacingPx, EditorButton } from "../ui_primitives";
import { extractKieTaskId, KIE_LOGS_URL } from "../../utils/kieTaskId";
import { useNodeStoreRef } from "../../contexts/NodeContext";
import type { NodeStoreState } from "../../stores/NodeStore";
import {
  formatInputConnections,
  formatNodeProperties,
  type InputConnection
} from "../../utils/bugReport";
import { openBugReport } from "../../stores/BugReportStore";

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
          source?.data?.title,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle
      };
    });
}

// The error banner look (DESIGN.md "Errors and banners"): a severity tint
// with a matching frame and readable body text, never a solid red block.
const errorStyles = (theme: Theme) =>
  css({
    position: "relative",
    backgroundColor: `rgb(${theme.vars.palette.error.mainChannel} / 0.12)`,
    border: `1px solid rgb(${theme.vars.palette.error.mainChannel} / 0.5)`,
    borderRadius: BORDER_RADIUS.lg,
    padding: theme.spacing(SPACING.md),
    transition: `background-color ${MOTION.normal}`,
    display: "flex",
    flexDirection: "column",
    gap: getSpacingPx(SPACING.md),
    width: "100%",
    maxWidth: "100%",

    ".error-text": {
      width: "100%",
      maxHeight: "18em",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.primary,
      cursor: "auto",
      userSelect: "text",
      lineHeight: 1.35,
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      wordBreak: "break-word",
      overflowY: "auto"
    },
    ".error-task-link": {
      paddingRight: getSpacingPx(18),
    },
    // In the flow below the text: absolutely placed, the buttons covered the
    // first line of the error on a narrow node.
    ".error-actions": {
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: getSpacingPx(SPACING.xs),
    },
  });

const NodeErrorsImpl: React.FC<{
  id: string;
  workflow_id: string;
  nodeType?: string;
}> = ({ id, workflow_id, nodeType = "unknown" }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const memoizedErrorStyles = useMemo(() => errorStyles(theme), [theme]);
  const error = useNodeError(workflow_id, id);
  const nodeStore = useNodeStoreRef();
  const focusedJobId = useWorkflowRunsStore(
    (state) => state.focusedJob[workflow_id]
  );
  const { openRunInspection } = useRunInspection();
  const setBottomPanelView = useBottomPanelStore(
    (state) => state.setActiveView
  );
  const setBottomPanelVisibility = useBottomPanelStore(
    (state) => state.setVisibility
  );

  const logs = useLogsStore(
    (state) => state.logsByNode[nodeLogKey(workflow_id, id)]
  );

  // Computed before the early return so the hook order stays stable
  // (rules-of-hooks). `nodeErrorToDisplayString` tolerates an absent error.
  const errorDisplay = nodeErrorToDisplayString(error);

  const handleReport = useCallback(() => {
    const state = nodeStore.getState();
    const node = state.findNode(id);
    // The dialog runs at the app root and cannot reach this node store, so the
    // node's settings and wiring travel with the request.
    openBugReport({
      source: "node-error",
      summary: errorDisplay.split("\n")[0],
      errorText: errorDisplay,
      nodeType,
      nodeTitle: node?.data?.title,
      nodeId: id,
      workflowId: workflow_id,
      nodeDetail: [
        `Node type: ${nodeType}`,
        ...(node?.data?.title ? [`Node title: ${node.data.title}`] : []),
        "",
        "--- Properties ---",
        formatNodeProperties(node?.data?.properties),
        "",
        "--- Connected inputs ---",
        formatInputConnections(collectInputConnections(state, id)),
        "",
        "--- Node logs ---",
        (logs ?? [])
          .map((l) => `[${l.severity.toUpperCase()}] ${l.content}`)
          .join("\n") || "(no logs captured)"
      ].join("\n")
    });
  }, [errorDisplay, logs, nodeType, nodeStore, id, workflow_id]);

  const chatAboutNodes = useChatAboutNodes();
  const handleAskChat = useCallback(() => {
    void chatAboutNodes([id], { error: errorDisplay });
  }, [chatAboutNodes, id, errorDisplay]);

  const kieTaskId = useMemo(
    () => extractKieTaskId(errorDisplay),
    [errorDisplay]
  );

  // The runs reader resolves a job id to its run. Without a job the panel
  // opens on this workflow's latest run.
  const handleViewLogs = useCallback(() => {
    if (focusedJobId) {
      openRunInspection({
        runId: focusedJobId,
        view: "logs",
        workflowId: workflow_id,
        nodeId: id
      });
      return;
    }
    setBottomPanelView("logs");
    setBottomPanelVisibility(true);
  }, [
    focusedJobId,
    id,
    openRunInspection,
    setBottomPanelView,
    setBottomPanelVisibility,
    workflow_id
  ]);

  if (!hasNodeError(error)) {
    return null;
  }

  return (
    <div css={memoizedErrorStyles} className="node-error nodrag nowheel">
      <div className="error-text">{errorDisplay}</div>
      <div className="error-actions">
        <EditorButton
          variant="outlined"
          color="inherit"
          startIcon={<ForumOutlinedIcon />}
          className="nodrag"
          onClick={handleAskChat}
          tooltip={t("screen_editor.nodeChat.askChatTooltip")}
          aria-label={t("screen_editor.nodeChat.askChat")}
        >
          {t("screen_editor.nodeChat.askChat")}
        </EditorButton>
        <EditorButton
          variant="outlined"
          color="inherit"
          startIcon={<ListAltIcon />}
          className="nodrag"
          onClick={handleViewLogs}
          tooltip={t("i18n-next36.nodeEditor.nodeErrors.viewLogsTooltip")}
          aria-label={t("i18n-next36.nodeEditor.nodeErrors.viewLogs")}
        >
          {t("i18n-next36.nodeEditor.nodeErrors.viewLogs")}
        </EditorButton>
        <EditorButton
          variant="outlined"
          color="inherit"
          startIcon={<BugReportIcon />}
          className="nodrag"
          onClick={handleReport}
          tooltip={t("i18n-next36.nodeEditor.nodeErrors.reportBugTooltip")}
          aria-label={t("i18n-next36.nodeEditor.nodeErrors.reportBug")}
        >
          {t("i18n-next36.nodeEditor.nodeErrors.reportBug")}
        </EditorButton>
        <CopyButton
          value={errorDisplay}
          tooltip={t("i18n-next36.nodeEditor.nodeErrors.copyError")}
        />
      </div>
      {kieTaskId ? (
        <div className="error-task-link">
          <ExternalLink
            href={KIE_LOGS_URL}
            size="small"
            iconVariant="open"
            tooltip={t("i18n-next36.nodeEditor.nodeErrors.openKieLogs", {
              taskId: kieTaskId
            })}
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

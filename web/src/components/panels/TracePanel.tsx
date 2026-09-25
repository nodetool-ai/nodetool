/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo, useState } from "react";
import { css } from "@emotion/react";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import BuildIcon from "@mui/icons-material/Build";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ChecklistIcon from "@mui/icons-material/Checklist";
import ErrorIcon from "@mui/icons-material/Error";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import OutputIcon from "@mui/icons-material/Output";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";

import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { requestFitNode } from "../../hooks/useFitNodeEvent";
import useTraceStore from "../../stores/TraceStore";
import type {
  TraceEvent,
  TraceEventType,
  TraceRun,
  TraceRunContext
} from "../../stores/TraceStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { formatTimeOfDay } from "../../utils/formatUtils";
import { isObjectLike, isString } from "../../utils/typePredicates";
import {
  CopyButton,
  DeleteButton,
  DownloadButton,
  EmptyState,
  ScrollArea,
  SelectField,
  SPACING,
  TextLink,
  getSpacingPx
} from "../ui_primitives";
import PanelToolbar from "./PanelToolbar";

const EVENT_ICONS = {
  node_start: <PlayArrowIcon sx={{ fontSize: 14, color: "info.main" }} />,
  node_complete: <CheckCircleIcon sx={{ fontSize: 14, color: "success.main" }} />,
  node_error: <ErrorIcon sx={{ fontSize: 14, color: "error.main" }} />,
  llm_call: <AutoAwesomeIcon sx={{ fontSize: 14, color: "warning.main" }} />,
  tool_call: <BuildIcon sx={{ fontSize: 14, color: "secondary.main" }} />,
  tool_result: <BuildIcon sx={{ fontSize: 14, color: "secondary.light" }} />,
  step_result: <TaskAltIcon sx={{ fontSize: 14, color: "success.light" }} />,
  todo_update: <ChecklistIcon sx={{ fontSize: 14, color: "info.light" }} />,
  edge_active: <CallSplitIcon sx={{ fontSize: 14, color: "text.disabled" }} />,
  output: <OutputIcon sx={{ fontSize: 14, color: "primary.main" }} />,
} satisfies Record<TraceEventType, React.ReactNode>;

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    ".trace-list": {
      flex: 1,
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmall)",
    },
    ".trace-row": {
      display: "flex",
      alignItems: "flex-start",
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.lg)}`, // was 3px 12px
      gap: 8,
      borderBottom: `1px solid ${theme.vars.palette.divider}22`,
      cursor: "pointer",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
      },
    },
    ".trace-row.expanded": {
      backgroundColor: theme.vars.palette.action.selected,
    },
    ".trace-time": {
      color: theme.vars.palette.text.disabled,
      minWidth: 150,
      flexShrink: 0,
      fontVariantNumeric: "tabular-nums",
    },
    ".trace-icon": {
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      marginTop: 1,
    },
    ".trace-summary": {
      flex: 1,
      color: theme.vars.palette.text.primary,
      wordBreak: "break-word",
    },
    ".trace-context": {
      color: theme.vars.palette.text.secondary,
      whiteSpace: "nowrap",
    },
    ".trace-context-separator": {
      color: theme.vars.palette.text.disabled,
      margin: `0 ${getSpacingPx(SPACING.xs)}`,
    },
    ".trace-node-link": {
      fontFamily: "inherit",
      fontSize: "inherit",
      lineHeight: "inherit",
    },
    ".trace-detail": {
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.md)} ${getSpacingPx(20)}`, // 80px
      backgroundColor: `${theme.vars.palette.background.paper}`,
      borderBottom: `1px solid ${theme.vars.palette.divider}44`,
      "& pre": {
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontSize: "var(--fontSizeSmall)",
        maxHeight: 400,
        overflow: "auto",
        color: theme.vars.palette.text.secondary,
      },
    },
    ".llm-section": {
      marginBottom: 8,
      "& .llm-label": {
        fontWeight: 600,
        color: theme.vars.palette.text.primary,
        fontSize: "var(--fontSizeSmall)",
        marginBottom: 2,
      },
    },
  });

function formatRelativeTime(ms: number): string {
  if (ms < 1000) {return `+${ms}ms`;}
  return `+${(ms / 1000).toFixed(1)}s`;
}

const shortRunLabel = (jobId: string): string => `Run #${jobId.slice(0, 8)}`;

const traceRunLabel = (run: TraceRun, activeRunId: string | null): string => {
  const workflowName = run.context?.workflowName ?? "Workflow";
  const runLabel = run.context?.jobId
    ? shortRunLabel(run.context.jobId)
    : `Run at ${formatTimeOfDay(run.startTime)}`;
  const status = run.id === activeRunId ? " (current)" : "";
  return `${workflowName} · ${runLabel}${status}`;
};

function getOutputText(detail: unknown): string | null {
  if (!detail || !isObjectLike(detail)) return null;
  const value = (detail as Record<string, unknown>).value;
  if (isString(value)) return value;
  return null;
}

interface LLMCallDetail {
  messages?: unknown[];
  response?: string | Record<string, unknown>;
  tool_calls?: unknown[];
  tokens_input?: number;
  tokens_output?: number;
  cost?: number;
  duration_ms?: number;
  error?: string;
}

function LLMDetail({ detail }: { detail: LLMCallDetail }) {
  return (
    <div>
      {detail.messages ? (
        <div className="llm-section">
          <div className="llm-label">Request ({detail.messages.length} messages)</div>
          <pre>{JSON.stringify(detail.messages, null, 2)}</pre>
        </div>
      ) : null}
      {detail.response ? (
        <div className="llm-section">
          <div className="llm-label">Response</div>
          <pre>{isString(detail.response) ? detail.response : JSON.stringify(detail.response, null, 2)}</pre>
        </div>
      ) : null}
      {detail.tool_calls && detail.tool_calls.length > 0 ? (
        <div className="llm-section">
          <div className="llm-label">Tool Calls</div>
          <pre>{JSON.stringify(detail.tool_calls, null, 2)}</pre>
        </div>
      ) : null}
      <div className="llm-section">
        <div className="llm-label">
          {[
            detail.tokens_input && `In: ${detail.tokens_input}`,
            detail.tokens_output && `Out: ${detail.tokens_output}`,
            detail.cost && `Cost: $${detail.cost.toFixed(4)}`,
            detail.duration_ms && `Duration: ${detail.duration_ms}ms`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      {detail.error ? (
        <div className="llm-section">
          <div className="llm-label" style={{ color: "var(--palette-error-main)" }}>Error</div>
          <pre>{String(detail.error)}</pre>
        </div>
      ) : null}
    </div>
  );
}

const TraceRow = memo(function TraceRow({
  event,
  runContext,
  expanded,
  onToggle,
  onRevealNode,
}: {
  event: TraceEvent;
  runContext: TraceRunContext | null;
  expanded: boolean;
  onToggle: (id: string) => void;
  onRevealNode: (workflowId: string, nodeId: string) => void;
}) {
  const handleClick = useCallback(() => onToggle(event.id), [onToggle, event.id]);
  const outputText = event.type === "output" ? getOutputText(event.detail) : null;
  const displaySummary =
    outputText !== null
      ? `${event.summary}: ${outputText.length > 80 ? outputText.slice(0, 80) + "…" : outputText}`
      : event.summary;
  const handleRevealNode = useCallback(
    (clickEvent: React.MouseEvent) => {
      clickEvent.stopPropagation();
      if (runContext && event.nodeId) {
        onRevealNode(runContext.workflowId, event.nodeId);
      }
    },
    [event.nodeId, onRevealNode, runContext]
  );

  return (
    <>
      <div
        className={`trace-row ${expanded ? "expanded" : ""}`}
        onClick={handleClick}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        <span className="trace-time">
          {formatTimeOfDay(event.timestamp)} ({formatRelativeTime(event.relativeMs)})
        </span>
        <span className="trace-icon">{EVENT_ICONS[event.type]}</span>
        {runContext ? (
          <span className="trace-context">
            <span title={runContext.workflowId}>{runContext.workflowName}</span>
            {runContext.jobId ? (
              <>
                <span className="trace-context-separator">→</span>
                <span title={runContext.jobId}>
                  {shortRunLabel(runContext.jobId)}
                </span>
              </>
            ) : null}
            {event.nodeId ? (
              <>
                <span className="trace-context-separator">→</span>
                <TextLink
                  asButton
                  className="trace-node-link"
                  onClick={handleRevealNode}
                  aria-label={`Reveal node ${event.nodeName || event.nodeId}`}
                >
                  {event.nodeName || event.nodeId}
                </TextLink>
              </>
            ) : null}
            <span className="trace-context-separator">·</span>
          </span>
        ) : null}
        <span className="trace-summary">{displaySummary}</span>
        {expanded ? (
          <ExpandLessIcon sx={{ fontSize: 14, color: "text.disabled" }} />
        ) : (
          <ExpandMoreIcon sx={{ fontSize: 14, color: "text.disabled" }} />
        )}
      </div>
      {expanded && (
        <div className="trace-detail">
          {event.type === "llm_call" ? (
            <LLMDetail detail={event.detail as LLMCallDetail} />
          ) : outputText !== null ? (
            <pre>{outputText}</pre>
          ) : (
            <pre>{JSON.stringify(event.detail, null, 2)}</pre>
          )}
        </div>
      )}
    </>
  );
});

const TracePanel: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const runs = useTraceStore((s) => s.runs);
  const activeRunId = useTraceStore((s) => s.activeRunId);
  const selectedRunId = useTraceStore((s) => s.selectedRunId);
  const events = useTraceStore((s) => s.events);
  const runContext = useTraceStore((s) => s.runContext);
  const selectRun = useTraceStore((s) => s.selectRun);
  const clear = useTraceStore((s) => s.clear);
  const exportJSON = useTraceStore((s) => s.exportJSON);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const currentWorkflowId = useWorkflowManager(
    (state) => state.currentWorkflowId
  );
  const setCurrentWorkflowId = useWorkflowManager(
    (state) => state.setCurrentWorkflowId
  );
  const getWorkflow = useWorkflowManager((state) => state.getWorkflow);
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const setActiveTab = useWorkspaceTabsStore((state) => state.setActiveTab);

  const runOptions = useMemo(
    () =>
      runs.map((run) => ({
        value: run.id,
        label: traceRunLabel(run, activeRunId)
      })),
    [activeRunId, runs]
  );

  // Collapse consecutive output events from the same node+output into one
  // row. Streaming output_update values are deltas (ResultsStore accumulates
  // them with append=true), so concatenate string values to show the full
  // streamed text. Keep the first event's id/relativeMs so an expanded row
  // survives new chunks and is anchored at the stream's start.
  const groupedEvents = useMemo(() => {
    const result: TraceEvent[] = [];
    for (const event of events) {
      const prev = result[result.length - 1];
      if (
        event.type === "output" &&
        prev?.type === "output" &&
        prev.nodeId === event.nodeId &&
        prev.summary === event.summary
      ) {
        const prevText = getOutputText(prev.detail);
        const text = getOutputText(event.detail);
        result[result.length - 1] = {
          ...event,
          id: prev.id,
          relativeMs: prev.relativeMs,
          timestamp: prev.timestamp,
          detail:
            prevText !== null && text !== null
              ? {
                  ...(event.detail as Record<string, unknown>),
                  value: prevText + text
                }
              : event.detail
        };
      } else {
        result.push(event);
      }
    }
    return result;
  }, [events]);

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {next.delete(id);}
      else {next.add(id);}
      return next;
    });
  }, []);

  const handleRevealNode = useCallback(
    (workflowId: string, nodeId: string) => {
      const workflowTabId = openTab({
        type: "workflow",
        ref: workflowId,
        mode: "edit",
        title:
          runs.find((run) => run.context?.workflowId === workflowId)?.context
            ?.workflowName ?? "Workflow",
        projectId: getWorkflow(workflowId)?.project_id ?? undefined
      });
      setActiveTab(workflowTabId);
      if (currentWorkflowId !== workflowId) {
        setCurrentWorkflowId(workflowId);
      }
      navigate("/workspace");
      requestFitNode({ workflowId, nodeId });
    },
    [
      currentWorkflowId,
      getWorkflow,
      navigate,
      openTab,
      runs,
      setActiveTab,
      setCurrentWorkflowId
    ]
  );

  const handleExport = useCallback(() => {
    const json = exportJSON();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trace-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    // Defer the revoke: releasing the blob synchronously cancels the download
    // in Firefox and for large files.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [exportJSON]);

  const copyValue = useMemo(
    () => (events.length > 0 ? exportJSON() : ""),
    [events, exportJSON]
  );

  const cssStyles = useMemo(() => styles(theme), [theme]);

  return (
    <div css={cssStyles}>
      <PanelToolbar
        title="Trace"
        count={events.length}
        actions={
          <>
            <CopyButton
              value={copyValue}
              tooltip="Copy to clipboard"
              disabled={events.length === 0}
              nodrag={false}
            />
            <DownloadButton
              onClick={handleExport}
              tooltip="Export as JSON"
              disabled={events.length === 0}
              nodrag={false}
            />
            <DeleteButton
              onClick={clear}
              tooltip="Clear trace"
              iconVariant="clear"
              nodrag={false}
            />
          </>
        }
      >
        {runs.length > 0 && selectedRunId ? (
          <SelectField
            label="Trace run"
            hideLabel
            size="small"
            variant="standard"
            value={selectedRunId}
            options={runOptions}
            onChange={selectRun}
          />
        ) : null}
      </PanelToolbar>
      <ScrollArea className="trace-list" direction="both">
        {events.length === 0 ? (
          <EmptyState
            variant="empty"
            title="No trace data"
            description="Run a workflow to see the execution trace"
            size="small"
          />
        ) : (
          groupedEvents.map((event) => (
            <TraceRow
              key={event.id}
              event={event}
              runContext={runContext}
              expanded={expandedIds.has(event.id)}
              onToggle={handleToggle}
              onRevealNode={handleRevealNode}
            />
          ))
        )}
      </ScrollArea>
    </div>
  );
};

export default memo(TracePanel);

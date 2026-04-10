/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useState } from "react";
import { CopyButton, DeleteButton, DownloadButton, EmptyState, ScrollArea, Text, FlexRow, Chip } from "../ui_primitives";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import BuildIcon from "@mui/icons-material/Build";
import OutputIcon from "@mui/icons-material/Output";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import useTraceStore from "../../stores/TraceStore";
import type { TraceEvent, TraceEventType } from "../../stores/TraceStore";


const EVENT_ICONS: Record<TraceEventType, React.ReactNode> = {
  node_start: <PlayArrowIcon sx={{ fontSize: 14, color: "info.main" }} />,
  node_complete: <CheckCircleIcon sx={{ fontSize: 14, color: "success.main" }} />,
  node_error: <ErrorIcon sx={{ fontSize: 14, color: "error.main" }} />,
  llm_call: <AutoAwesomeIcon sx={{ fontSize: 14, color: "warning.main" }} />,
  tool_call: <BuildIcon sx={{ fontSize: 14, color: "secondary.main" }} />,
  tool_result: <BuildIcon sx={{ fontSize: 14, color: "secondary.light" }} />,
  edge_active: <CallSplitIcon sx={{ fontSize: 14, color: "text.disabled" }} />,
  output: <OutputIcon sx={{ fontSize: 14, color: "primary.main" }} />,
};

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    ".trace-toolbar": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "4px 12px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      minHeight: 36,
    },
    ".trace-list": {
      flex: 1,
      fontFamily: "monospace",
      fontSize: "0.8rem",
    },
    ".trace-row": {
      display: "flex",
      alignItems: "flex-start",
      padding: "3px 12px",
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
      minWidth: 60,
      flexShrink: 0,
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
    ".trace-detail": {
      padding: "8px 12px 8px 80px",
      backgroundColor: `${theme.vars.palette.background.paper}`,
      borderBottom: `1px solid ${theme.vars.palette.divider}44`,
      "& pre": {
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontSize: "0.75rem",
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
        fontSize: "0.75rem",
        marginBottom: 2,
      },
    },
  });

function formatRelativeTime(ms: number): string {
  if (ms < 1000) {return `+${ms}ms`;}
  return `+${(ms / 1000).toFixed(1)}s`;
}

function LLMDetail({ detail }: { detail: Record<string, unknown> }) {
  return (
    <div>
      {detail.messages ? (
        <div className="llm-section">
          <div className="llm-label">Request ({(detail.messages as unknown[]).length} messages)</div>
          <pre>{JSON.stringify(detail.messages, null, 2)}</pre>
        </div>
      ) : null}
      {detail.response ? (
        <div className="llm-section">
          <div className="llm-label">Response</div>
          <pre>{typeof detail.response === "string" ? detail.response : JSON.stringify(detail.response, null, 2)}</pre>
        </div>
      ) : null}
      {detail.tool_calls && (detail.tool_calls as unknown[]).length > 0 ? (
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
            detail.cost && `Cost: $${(detail.cost as number).toFixed(4)}`,
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
  expanded,
  onToggle,
}: {
  event: TraceEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <div
        className={`trace-row ${expanded ? "expanded" : ""}`}
        onClick={onToggle}
      >
        <span className="trace-time">{formatRelativeTime(event.relativeMs)}</span>
        <span className="trace-icon">{EVENT_ICONS[event.type]}</span>
        <span className="trace-summary">{event.summary}</span>
        {expanded ? (
          <ExpandLessIcon sx={{ fontSize: 14, color: "text.disabled" }} />
        ) : (
          <ExpandMoreIcon sx={{ fontSize: 14, color: "text.disabled" }} />
        )}
      </div>
      {expanded && (
        <div className="trace-detail">
          {event.type === "llm_call" ? (
            <LLMDetail detail={event.detail as Record<string, unknown>} />
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
  const events = useTraceStore((s) => s.events);
  const clear = useTraceStore((s) => s.clear);
  const exportJSON = useTraceStore((s) => s.exportJSON);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {next.delete(id);}
      else {next.add(id);}
      return next;
    });
  }, []);

  const handleExport = useCallback(() => {
    const json = exportJSON();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trace-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportJSON]);

  return (
    <div css={styles(theme)}>
      <div className="trace-toolbar">
        <FlexRow align="center" gap={1}>
          <Text size="small" weight={500}>
            Trace
          </Text>
          <Chip label={events.length} size="small" variant="outlined" />
        </FlexRow>
        <FlexRow gap={0.5}>
          <CopyButton
            value={events.length > 0 ? exportJSON() : ""}
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
        </FlexRow>
      </div>
      <ScrollArea className="trace-list" direction="both">
        {events.length === 0 ? (
          <EmptyState
            variant="empty"
            title="No trace data"
            description="Run a workflow to see the execution trace"
            size="small"
          />
        ) : (
          events.map((event) => (
            <TraceRow
              key={event.id}
              event={event}
              expanded={expandedIds.has(event.id)}
              onToggle={() => handleToggle(event.id)}
            />
          ))
        )}
      </ScrollArea>
    </div>
  );
};

export default memo(TracePanel);

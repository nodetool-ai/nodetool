/** @jsxImportSource @emotion/react */
/**
 * ExecutionTree — Agent plan/execution timeline.
 *
 * Renders the agent task/step hierarchy as a vertical status timeline:
 * a plan header with progress bar and per-status dot counts, then one
 * timeline node per task (check / spinner / waiting circle / failed) joined
 * by status-colored connector lines, with the task's steps nested inside.
 */

import React, { memo, useMemo, useState, useCallback } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import {
  FlexRow,
  FlexColumn,
  BORDER_RADIUS,
  MOTION,
  reducedMotion
} from "../ui_primitives";
import type {
  ExecutionTreeState,
  TaskState,
  StepState,
  StepToolCallEntry,
  PlanningEntry
} from "../../hooks/useExecutionTreeState";

type NodeStatus = "waiting" | "running" | "completed" | "failed";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const treeStyles = (theme: Theme) =>
  css({
    fontFamily: theme.fontFamily1,
    fontSize: "var(--fontSizeSmall)",
    lineHeight: 1.5,
    userSelect: "text",

    "@keyframes tlSpin": {
      from: { transform: "rotate(0deg)" },
      to: { transform: "rotate(360deg)" }
    },

    "@keyframes tlPulse": {
      "0%, 100%": { opacity: 1 },
      "50%": { opacity: 0.4 }
    },

    ".plan-card": {
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.lg,
      overflow: "hidden",
      background: "transparent"
    },

    ".plan-header": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(2),
      padding: theme.spacing(1.25, 2),
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },

    ".plan-title": {
      fontSize: "var(--fontSizeSmall)",
      fontWeight: 500,
      color: theme.vars.palette.text.primary,
      whiteSpace: "nowrap"
    },

    ".plan-progress-track": {
      flex: 1,
      height: 6,
      borderRadius: BORDER_RADIUS.pill,
      background: theme.vars.palette.action.hover,
      overflow: "hidden"
    },

    ".plan-progress-fill": {
      height: "100%",
      borderRadius: BORDER_RADIUS.pill,
      background: theme.vars.palette.text.primary,
      transition: `width ${MOTION.slow}`,
      ...reducedMotion({ transition: MOTION.none })
    },

    ".plan-count": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.secondary,
      fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap"
    },

    ".plan-dots": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1.5)
    },

    ".plan-dot": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5),
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.secondary,
      whiteSpace: "nowrap",
      "&::before": {
        content: '""',
        width: 6,
        height: 6,
        borderRadius: BORDER_RADIUS.circle,
        background: "currentColor"
      }
    },

    ".plan-dot.completed::before": { background: theme.vars.palette.success.main },
    ".plan-dot.running::before": { background: theme.vars.palette.info.main },
    ".plan-dot.failed::before": { background: theme.vars.palette.error.main },
    ".plan-dot.waiting::before": {
      background: theme.vars.palette.action.disabled
    },

    ".plan-body": {
      padding: theme.spacing(2)
    },

    // ── Timeline nodes ─────────────────────────────────────────────────────
    ".tl-item": {
      display: "flex",
      gap: theme.spacing(1.5),
      position: "relative"
    },

    ".tl-rail": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      flexShrink: 0
    },

    ".tl-badge": {
      width: 24,
      height: 24,
      borderRadius: BORDER_RADIUS.circle,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      zIndex: 1,
      transition: MOTION.all,
      ...reducedMotion({ transition: MOTION.none }),
      "& svg": { fontSize: 14 }
    },

    ".tl-badge.completed": {
      background: theme.vars.palette.success.main,
      color: theme.vars.palette.success.contrastText
    },

    ".tl-badge.failed": {
      background: theme.vars.palette.error.main,
      color: theme.vars.palette.error.contrastText
    },

    ".tl-badge.running": {
      background: theme.vars.palette.info.main,
      color: theme.vars.palette.info.contrastText,
      boxShadow: `0 0 0 4px rgb(${theme.vars.palette.info.mainChannel} / 0.2)`,
      "& svg": {
        animation: `tlSpin ${MOTION.spin} infinite`,
        ...reducedMotion({ animation: "none" })
      }
    },

    ".tl-badge.waiting": {
      background: theme.vars.palette.action.hover,
      color: theme.vars.palette.text.disabled,
      "&::after": {
        content: '""',
        width: 8,
        height: 8,
        borderRadius: BORDER_RADIUS.circle,
        border: `2px solid currentColor`
      }
    },

    ".tl-connector": {
      width: 2,
      flex: 1,
      minHeight: theme.spacing(1.5),
      background: theme.vars.palette.divider
    },

    ".tl-connector.completed": {
      background: `rgb(${theme.vars.palette.success.mainChannel} / 0.4)`
    },
    ".tl-connector.running": {
      background: `rgb(${theme.vars.palette.info.mainChannel} / 0.4)`
    },
    ".tl-connector.failed": {
      background: `rgb(${theme.vars.palette.error.mainChannel} / 0.4)`
    },

    ".tl-content": {
      flex: 1,
      minWidth: 0,
      paddingBottom: theme.spacing(2.5)
    },

    ".tl-item.last > .tl-content": {
      paddingBottom: 0
    },

    ".tl-row": {
      display: "flex",
      alignItems: "flex-start",
      gap: theme.spacing(1),
      minHeight: 24
    },

    ".tl-row-main": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      flex: 1,
      minWidth: 0,
      textAlign: "left"
    },

    ".tl-row-main.clickable": {
      cursor: "pointer",
      "&:hover .tl-name": {
        textDecoration: "underline",
        textDecorationColor: theme.vars.palette.text.secondary,
        textUnderlineOffset: "2px"
      },
      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: 2,
        borderRadius: BORDER_RADIUS.xs
      }
    },

    ".tl-name": {
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.secondary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },

    ".tl-name.running": {
      color: theme.vars.palette.text.primary,
      fontWeight: 500
    },

    ".tl-name.waiting": {
      color: theme.vars.palette.text.disabled
    },

    ".tl-name.failed": {
      color: theme.vars.palette.error.main
    },

    ".tl-chevron": {
      fontSize: 14,
      color: theme.vars.palette.text.disabled,
      flexShrink: 0,
      transition: MOTION.transform,
      ...reducedMotion({ transition: MOTION.none }),
      "&.collapsed": { transform: "rotate(-90deg)" }
    },

    ".tl-meta": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5),
      flexShrink: 0,
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.secondary,
      fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap",
      "& svg": { fontSize: 11 }
    },

    ".tl-meta.running": {
      fontFamily: theme.fontFamily1,
      color: theme.vars.palette.info.main,
      "&::before": {
        content: '""',
        width: 6,
        height: 6,
        borderRadius: BORDER_RADIUS.circle,
        background: "currentColor",
        animation: `tlPulse ${MOTION.pulse} infinite`,
        ...reducedMotion({ animation: "none" })
      }
    },

    ".tl-meta.waiting": {
      fontFamily: theme.fontFamily1,
      color: theme.vars.palette.text.disabled
    },

    ".tl-detail": {
      marginTop: theme.spacing(0.25),
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      lineHeight: 1.6,
      color: theme.vars.palette.text.secondary,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word"
    },

    ".tl-detail.error": {
      color: theme.vars.palette.error.main
    },

    ".tl-children": {
      marginTop: theme.spacing(1.5)
    },

    // ── Planning trace ─────────────────────────────────────────────────────
    ".planning-log": {
      display: "flex",
      flexDirection: "column",
      marginBottom: theme.spacing(1)
    },

    ".planning-phase": {
      fontSize: "var(--fontSizeSmall)",
      fontWeight: 500,
      textTransform: "capitalize",
      color: theme.vars.palette.text.primary,
      whiteSpace: "nowrap"
    },

    ".planning-content": {
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.secondary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },

    // ── Step inspector ─────────────────────────────────────────────────────
    ".tl-inspector": {
      marginTop: theme.spacing(1),
      padding: theme.spacing(1, 1.5),
      borderLeft: `2px solid ${theme.vars.palette.divider}`,
      background: `${theme.vars.palette.action.hover}`,
      borderRadius: `0 ${BORDER_RADIUS.sm} ${BORDER_RADIUS.sm} 0`,
      fontSize: "var(--fontSizeSmall)",
      lineHeight: 1.5,
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1)
    },

    ".tl-inspector-section": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.25)
    },

    ".tl-inspector-label": {
      color: theme.vars.palette.text.secondary,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      fontSize: "var(--fontSizeSmaller)"
    },

    ".tl-inspector-body": {
      color: theme.vars.palette.text.primary,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmall)"
    },

    ".tl-inspector-code": {
      margin: 0,
      color: theme.vars.palette.text.primary,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmall)",
      background: theme.vars.palette.background.default,
      padding: theme.spacing(0.75, 1),
      borderRadius: BORDER_RADIUS.sm,
      maxHeight: "20rem",
      overflow: "auto"
    },

    ".tl-inspector-tool": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.25),
      padding: theme.spacing(0.5, 0),
      borderTop: `1px dashed ${theme.vars.palette.divider}`,
      "&:first-of-type": { borderTop: "none" }
    },

    ".tl-inspector-error": {
      color: theme.vars.palette.error.main
    }
  });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined) return "";
  if (seconds < 0.1) return "<0.1s";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m${secs.toFixed(0)}s`;
}

function truncateOutput(output: string, maxLines: number = 2): string {
  if (!output) return "";
  const lines = output.trim().split("\n");
  const truncated = lines.slice(-maxLines);
  let result = truncated.join("\n").slice(0, 120);
  if (lines.length > maxLines) result = "..." + result;
  return result;
}

function stringifyResult(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

const StatusBadge: React.FC<{ status: NodeStatus }> = memo(({ status }) => (
  <div className={`tl-badge ${status}`} aria-hidden>
    {status === "completed" && <CheckRoundedIcon />}
    {status === "failed" && <CloseRoundedIcon />}
    {status === "running" && <AutorenewRoundedIcon />}
  </div>
));

StatusBadge.displayName = "StatusBadge";

// ---------------------------------------------------------------------------
// Step inspector
// ---------------------------------------------------------------------------

const StepInspector: React.FC<{ step: StepState }> = memo(({ step }) => {
  const resultText = useMemo(() => stringifyResult(step.rawResult), [step.rawResult]);

  return (
    <div className="tl-inspector">
      {step.instructions ? (
        <div className="tl-inspector-section">
          <span className="tl-inspector-label">Instructions</span>
          <span className="tl-inspector-body">{step.instructions}</span>
        </div>
      ) : null}

      {step.duration !== undefined ? (
        <div className="tl-inspector-section">
          <span className="tl-inspector-label">Duration</span>
          <span className="tl-inspector-body">
            {formatDuration(step.duration)}
          </span>
        </div>
      ) : null}

      {step.toolCalls.length > 0 ? (
        <div className="tl-inspector-section">
          <span className="tl-inspector-label">
            Tool calls ({step.toolCalls.length})
          </span>
          {step.toolCalls.map((call: StepToolCallEntry, i: number) => (
            <div
              key={call.id ?? `${call.name}-${i}`}
              className="tl-inspector-tool"
            >
              <span className="tl-inspector-body">
                <strong>{call.name || "tool"}</strong>
                {call.message ? `  ${call.message}` : ""}
              </span>
              {Object.keys(call.args ?? {}).length > 0 ? (
                <pre className="tl-inspector-code">
                  {JSON.stringify(call.args, null, 2)}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {resultText ? (
        <div className="tl-inspector-section">
          <span className="tl-inspector-label">Result</span>
          <pre className="tl-inspector-code">{resultText}</pre>
        </div>
      ) : null}

      {step.error ? (
        <div className="tl-inspector-section">
          <span className="tl-inspector-label tl-inspector-error">Error</span>
          <pre className="tl-inspector-code tl-inspector-error">
            {step.error}
          </pre>
        </div>
      ) : null}
    </div>
  );
});

StepInspector.displayName = "StepInspector";

// ---------------------------------------------------------------------------
// Step node
// ---------------------------------------------------------------------------

const StepNode: React.FC<{
  step: StepState;
  isLast: boolean;
}> = memo(({ step, isLast }) => {
  const [expanded, setExpanded] = useState(false);

  const displayName = step.toolName
    ? step.toolArgs
      ? `${step.toolName}(${step.toolArgs.slice(0, 50)})`
      : step.toolName
    : step.name.slice(0, 80);

  const outputPreview = truncateOutput(step.output);
  const errorText = typeof step.error === "string" ? step.error : "";
  const errorPreview = errorText.slice(0, 120);

  const hasInspector =
    !!step.instructions ||
    step.toolCalls.length > 0 ||
    !!step.rawResult ||
    !!step.error;

  const handleToggle = useCallback(() => {
    if (hasInspector) setExpanded((v) => !v);
  }, [hasInspector]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (hasInspector && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        setExpanded((v) => !v);
      }
    },
    [hasInspector]
  );

  return (
    <div className={`tl-item${isLast ? " last" : ""}`}>
      <div className="tl-rail">
        <StatusBadge status={step.status} />
        {!isLast && <div className={`tl-connector ${step.status}`} aria-hidden />}
      </div>
      <div className="tl-content">
        <div className="tl-row">
          <FlexRow
            className={`tl-row-main${hasInspector ? " clickable" : ""}`}
            align="center"
            gap={1}
            role={hasInspector ? "button" : undefined}
            tabIndex={hasInspector ? 0 : undefined}
            aria-expanded={hasInspector ? expanded : undefined}
            onClick={hasInspector ? handleToggle : undefined}
            onKeyDown={hasInspector ? handleKeyDown : undefined}
          >
            <span className={`tl-name ${step.status}`}>{displayName}</span>
          </FlexRow>
          {step.status === "running" ? (
            <span className="tl-meta running">In progress</span>
          ) : step.duration !== undefined ? (
            <span className="tl-meta">
              <AccessTimeRoundedIcon aria-hidden />
              {formatDuration(step.duration)}
            </span>
          ) : null}
        </div>
        {outputPreview && !expanded ? (
          <div className="tl-detail">{outputPreview}</div>
        ) : null}
        {errorPreview && !expanded ? (
          <div className="tl-detail error">{errorPreview}</div>
        ) : null}
        {expanded && hasInspector ? <StepInspector step={step} /> : null}
      </div>
    </div>
  );
});

StepNode.displayName = "StepNode";

// ---------------------------------------------------------------------------
// Task node
// ---------------------------------------------------------------------------

const TaskNode: React.FC<{
  task: TaskState;
  isLast: boolean;
  onToggleTask: (taskId: string) => void;
}> = memo(({ task, isLast, onToggleTask }) => {
  const stepCount = task.steps.length;
  const completedSteps = task.steps.filter(
    (s) => s.status === "completed"
  ).length;
  const duration =
    task.duration !== undefined ? formatDuration(task.duration) : "";
  const hasSteps = stepCount > 0;

  const onToggle = useCallback(() => {
    onToggleTask(task.id);
  }, [onToggleTask, task.id]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggle();
      }
    },
    [onToggle]
  );

  return (
    <div className={`tl-item${isLast ? " last" : ""}`}>
      <div className="tl-rail">
        <StatusBadge status={task.status} />
        {!isLast && <div className={`tl-connector ${task.status}`} aria-hidden />}
      </div>
      <div className="tl-content">
        <div className="tl-row">
          <FlexRow
            className={`tl-row-main${hasSteps ? " clickable" : ""}`}
            align="center"
            gap={1}
            role={hasSteps ? "button" : undefined}
            tabIndex={hasSteps ? 0 : undefined}
            aria-expanded={hasSteps ? task.expanded : undefined}
            onClick={hasSteps ? onToggle : undefined}
            onKeyDown={hasSteps ? handleKeyDown : undefined}
          >
            <span className={`tl-name ${task.status}`}>{task.name}</span>
            {hasSteps && (
              <ExpandMoreIcon
                className={`tl-chevron${task.expanded ? "" : " collapsed"}`}
                aria-hidden
              />
            )}
          </FlexRow>
          {task.status === "running" ? (
            <span className="tl-meta running">In progress</span>
          ) : task.status === "waiting" ? (
            <span className="tl-meta waiting">waiting</span>
          ) : (
            <span className="tl-meta">
              {duration && (
                <>
                  <AccessTimeRoundedIcon aria-hidden />
                  {duration}
                </>
              )}
              {hasSteps ? ` ${completedSteps}/${stepCount} steps` : null}
            </span>
          )}
        </div>
        {task.expanded && hasSteps ? (
          <div className="tl-children">
            {task.steps.map((step, i) => (
              <StepNode
                key={step.id}
                step={step}
                isLast={i === task.steps.length - 1}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
});

TaskNode.displayName = "TaskNode";

// ---------------------------------------------------------------------------
// Planning log
// ---------------------------------------------------------------------------

const PlanningLog: React.FC<{
  entries: PlanningEntry[];
  isActive: boolean;
}> = memo(({ entries, isActive }) => {
  if (entries.length === 0) {
    if (isActive) {
      return (
        <div className="planning-log">
          <div className="tl-item last">
            <div className="tl-rail">
              <StatusBadge status="running" />
            </div>
            <div className="tl-content">
              <div className="tl-row">
                <span className="planning-phase">Planning</span>
                <span className="tl-meta running">In progress</span>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="planning-log">
      {entries.map((entry, i) => {
        const isLast = i === entries.length - 1;
        const isRunning = isLast && isActive;
        const status: NodeStatus =
          entry.status === "failed"
            ? "failed"
            : isRunning
              ? "running"
              : "completed";

        return (
          <div
            key={`${entry.phase}-${i}`}
            className={`tl-item${isLast ? " last" : ""}`}
          >
            <div className="tl-rail">
              <StatusBadge status={status} />
              {!isLast && <div className={`tl-connector ${status}`} aria-hidden />}
            </div>
            <div className="tl-content">
              <div className="tl-row">
                <span className="planning-phase">{entry.phase}</span>
                {isRunning && <span className="tl-meta running">In progress</span>}
              </div>
              {entry.content ? (
                <div className="planning-content">{entry.content}</div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
});

PlanningLog.displayName = "PlanningLog";

// ---------------------------------------------------------------------------
// Main tree
// ---------------------------------------------------------------------------

interface ExecutionTreeProps {
  state: ExecutionTreeState;
  onToggleTask: (taskId: string) => void;
}

const ExecutionTree: React.FC<ExecutionTreeProps> = ({ state, onToggleTask }) => {
  const theme = useTheme();

  const counts = useMemo(() => {
    const c = { completed: 0, running: 0, waiting: 0, failed: 0 };
    for (const t of state.tasks) c[t.status] += 1;
    return c;
  }, [state.tasks]);

  if (state.phase === "idle") return null;

  const hasTasks = state.tasks.length > 0;
  const total = state.tasks.length;
  const progressPct = total > 0 ? (counts.completed / total) * 100 : 0;

  return (
    <div css={treeStyles(theme)}>
      {/* Planning trace is a live indicator — only keep it on screen while
          planning is still running. Once planning is complete, the plan
          timeline below is the durable representation. */}
      {state.phase === "planning" && (
        <PlanningLog entries={state.planningLog} isActive={true} />
      )}
      {hasTasks && (
        <div className="plan-card">
          <FlexRow className="plan-header" align="center" gap={2}>
            <span className="plan-title">Execution plan</span>
            <div
              className="plan-progress-track"
              role="progressbar"
              aria-valuenow={counts.completed}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-label="Completed tasks"
            >
              <div
                className="plan-progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="plan-count">
              {counts.completed}/{total}
            </span>
            <div className="plan-dots">
              {counts.completed > 0 && (
                <span className="plan-dot completed">{counts.completed}</span>
              )}
              {counts.running > 0 && (
                <span className="plan-dot running">{counts.running}</span>
              )}
              {counts.failed > 0 && (
                <span className="plan-dot failed">{counts.failed}</span>
              )}
              {counts.waiting > 0 && (
                <span className="plan-dot waiting">{counts.waiting}</span>
              )}
            </div>
          </FlexRow>
          <FlexColumn className="plan-body" gap={0}>
            {state.tasks.map((task, i) => (
              <TaskNode
                key={task.id}
                task={task}
                isLast={i === state.tasks.length - 1}
                onToggleTask={onToggleTask}
              />
            ))}
          </FlexColumn>
        </div>
      )}
    </div>
  );
};

export default memo(ExecutionTree);

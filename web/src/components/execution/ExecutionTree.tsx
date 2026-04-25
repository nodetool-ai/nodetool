/** @jsxImportSource @emotion/react */
/**
 * ExecutionTree — Web port of the CLI tree execution view.
 *
 * Renders agent task/step hierarchy as an interactive tree:
 *
 * ◆ Plan  (2/3 tasks)
 * ├─ ✓ Task 1: Search for sources              3.2s (3 steps)
 * ├─ ◐ Task 2: Analyze findings
 * │  ├─ ✓ google_search("topic")
 * │  │    → Found 5 results
 * │  └─ ◐ llm_call
 * │       → The key themes emerging from...
 * └─ ○ Task 3: Write summary                   waiting
 */

import React, { memo, useMemo, useState, useCallback } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Text, FlexRow, FlexColumn } from "../ui_primitives";
import type {
  ExecutionTreeState,
  TaskState,
  StepState,
  StepToolCallEntry,
  PlanningEntry,
  LogEntry
} from "../../hooks/useExecutionTreeState";

// ---------------------------------------------------------------------------
// Icons (matching CLI)
// ---------------------------------------------------------------------------

const ICONS = {
  waiting: "○",
  running: "◐",
  completed: "✓",
  failed: "✗",
  plan: "◆"
} as const;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const treeStyles = (theme: Theme) =>
  css({
    fontFamily: theme.fontFamily2 || "monospace",
    fontSize: "0.8rem",
    lineHeight: 1.6,
    padding: "0.75rem 0",
    userSelect: "text",

    ".tree-plan-header": {
      display: "flex",
      alignItems: "center",
      gap: "0.35rem",
      marginBottom: "0.25rem"
    },

    ".tree-plan-icon": {
      color: theme.vars.palette.primary.main,
      fontWeight: 700
    },

    ".tree-plan-label": {
      color: theme.vars.palette.primary.main,
      fontWeight: 700,
      fontSize: "0.85rem"
    },

    ".tree-plan-count": {
      color: theme.vars.palette.text.secondary,
      fontSize: "0.75rem",
      marginLeft: "0.25rem"
    },

    ".tree-task": {
      cursor: "pointer",
      "&:hover .tree-task-name": {
        textDecoration: "underline",
        textDecorationColor: theme.vars.palette.text.secondary,
        textUnderlineOffset: "2px"
      }
    },

    ".tree-branch": {
      color: theme.vars.palette.text.disabled,
      whiteSpace: "pre"
    },

    "@keyframes gradientShift": {
      "0%": { color: theme.vars.palette.warning.main },
      "50%": { color: theme.vars.palette.primary.main },
      "100%": { color: theme.vars.palette.warning.main }
    },

    "@keyframes treeItemEnter": {
      "0%": { opacity: 0, transform: "translateY(-4px)" },
      "100%": { opacity: 1, transform: "translateY(0)" }
    },

    "@media (prefers-reduced-motion: no-preference)": {
      ".tree-planning-entry, .tree-task, .tree-step, .tree-plan-header": {
        animation: "treeItemEnter 220ms ease-out both"
      }
    },

    ".tree-icon-waiting": { color: theme.vars.palette.text.disabled },
    ".tree-icon-running": {
      animation: "gradientShift 2s ease-in-out infinite"
    },
    ".tree-icon-completed": { color: theme.vars.palette.success.main },
    ".tree-icon-failed": { color: theme.vars.palette.error.main },

    ".tree-task-name": {
      fontWeight: 600,
      marginLeft: "0.2rem"
    },

    ".tree-task-meta": {
      color: theme.vars.palette.text.secondary,
      fontSize: "0.75rem",
      marginLeft: "0.5rem"
    },

    ".tree-step-name": {
      marginLeft: "0.2rem"
    },

    ".tree-step-output": {
      color: theme.vars.palette.text.secondary,
      fontSize: "0.75rem"
    },

    ".tree-step-error": {
      color: theme.vars.palette.error.main,
      fontSize: "0.75rem"
    },

    ".tree-planning": {
      display: "flex",
      alignItems: "center",
      gap: "0.35rem",
      fontFamily: theme.fontFamily1,
      color: theme.vars.palette.warning.main
    },

    ".tree-planning-text": {
      fontFamily: theme.fontFamily1,
      color: theme.vars.palette.text.secondary,
      fontSize: "0.8125rem",
      marginLeft: "0.25rem"
    },

    ".tree-planning-log": {
      display: "flex",
      flexDirection: "column",
      gap: "0.2rem",
      marginBottom: "0.5rem",
      fontFamily: theme.fontFamily1
    },

    ".tree-planning-entry": {
      display: "flex",
      alignItems: "baseline",
      gap: "0.5rem",
      fontFamily: theme.fontFamily1
    },

    ".tree-planning-phase": {
      fontFamily: theme.fontFamily1,
      fontSize: "0.8125rem",
      fontWeight: 600,
      textTransform: "capitalize",
      letterSpacing: 0,
      minWidth: "5.5rem",
      flexShrink: 0
    },

    ".tree-planning-content": {
      fontFamily: theme.fontFamily1,
      color: theme.vars.palette.text.secondary,
      fontSize: "0.8125rem",
      lineHeight: 1.45,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },

    ".tree-log-entry": {
      color: theme.vars.palette.text.disabled,
      fontSize: "0.7rem",
      paddingLeft: "1.5rem"
    },

    ".tree-step-row": {
      cursor: "pointer",
      "&:hover .tree-step-name": {
        textDecoration: "underline",
        textDecorationColor: theme.vars.palette.text.secondary,
        textUnderlineOffset: "2px"
      }
    },

    ".tree-step-inspector": {
      marginTop: "0.25rem",
      marginBottom: "0.4rem",
      padding: "0.5rem 0.75rem",
      borderLeft: `2px solid ${theme.vars.palette.divider}`,
      background: `${theme.vars.palette.action.hover}`,
      borderRadius: "0 var(--rounded-sm) var(--rounded-sm) 0",
      fontSize: "0.75rem",
      lineHeight: 1.5,
      display: "flex",
      flexDirection: "column",
      gap: "0.4rem"
    },

    ".tree-step-inspector-section": {
      display: "flex",
      flexDirection: "column",
      gap: "0.15rem"
    },

    ".tree-step-inspector-label": {
      color: theme.vars.palette.text.secondary,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      fontSize: "0.65rem"
    },

    ".tree-step-inspector-body": {
      color: theme.vars.palette.text.primary,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      fontFamily: theme.fontFamily2 || "monospace",
      fontSize: "0.72rem"
    },

    ".tree-step-inspector-code": {
      color: theme.vars.palette.text.primary,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      fontFamily: theme.fontFamily2 || "monospace",
      fontSize: "0.72rem",
      background: theme.vars.palette.background.default,
      padding: "0.35rem 0.5rem",
      borderRadius: "var(--rounded-sm)",
      maxHeight: "20rem",
      overflow: "auto"
    },

    ".tree-step-inspector-tool": {
      display: "flex",
      flexDirection: "column",
      gap: "0.15rem",
      padding: "0.25rem 0",
      borderTop: `1px dashed ${theme.vars.palette.divider}`,
      "&:first-of-type": { borderTop: "none" }
    },

    ".tree-step-inspector-error": {
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

// ---------------------------------------------------------------------------
// Step rendering
// ---------------------------------------------------------------------------

function stringifyResult(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

const StepInspector: React.FC<{ step: StepState }> = memo(({ step }) => {
  const resultText = useMemo(() => stringifyResult(step.rawResult), [step.rawResult]);

  return (
    <div className="tree-step-inspector">
      {step.instructions ? (
        <div className="tree-step-inspector-section">
          <span className="tree-step-inspector-label">Instructions</span>
          <span className="tree-step-inspector-body">{step.instructions}</span>
        </div>
      ) : null}

      {step.duration !== undefined ? (
        <div className="tree-step-inspector-section">
          <span className="tree-step-inspector-label">Duration</span>
          <span className="tree-step-inspector-body">
            {formatDuration(step.duration)}
          </span>
        </div>
      ) : null}

      {step.toolCalls.length > 0 ? (
        <div className="tree-step-inspector-section">
          <span className="tree-step-inspector-label">
            Tool calls ({step.toolCalls.length})
          </span>
          {step.toolCalls.map((call: StepToolCallEntry, i: number) => (
            <div
              key={call.id ?? `${call.name}-${i}`}
              className="tree-step-inspector-tool"
            >
              <span className="tree-step-inspector-body">
                <strong>{call.name || "tool"}</strong>
                {call.message ? `  ${call.message}` : ""}
              </span>
              {Object.keys(call.args ?? {}).length > 0 ? (
                <pre className="tree-step-inspector-code">
                  {JSON.stringify(call.args, null, 2)}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {resultText ? (
        <div className="tree-step-inspector-section">
          <span className="tree-step-inspector-label">Result</span>
          <pre className="tree-step-inspector-code">{resultText}</pre>
        </div>
      ) : null}

      {step.error ? (
        <div className="tree-step-inspector-section">
          <span className="tree-step-inspector-label tree-step-inspector-error">
            Error
          </span>
          <pre className="tree-step-inspector-code tree-step-inspector-error">
            {step.error}
          </pre>
        </div>
      ) : null}
    </div>
  );
});

StepInspector.displayName = "StepInspector";

const StepNode: React.FC<{
  step: StepState;
  isLast: boolean;
  parentPrefix: string;
}> = memo(({ step, isLast, parentPrefix }) => {
  const [expanded, setExpanded] = useState(false);
  const branch = isLast ? "└─ " : "├─ ";
  const cont = isLast ? "   " : "│  ";
  const iconClass = `tree-icon-${step.status}`;
  const icon = ICONS[step.status];

  const displayName = step.toolName
    ? step.toolArgs
      ? `${step.toolName}(${step.toolArgs.slice(0, 50)})`
      : step.toolName
    : step.name.slice(0, 60);

  const duration =
    step.duration !== undefined ? ` ${formatDuration(step.duration)}` : "";
  const outputPreview = truncateOutput(step.output);
  const errorText =
    typeof step.error === "string" ? step.error : "";
  const errorPreview = errorText.slice(0, 120);

  const hasInspector =
    !!step.instructions ||
    step.toolCalls.length > 0 ||
    !!step.rawResult ||
    !!step.error;

  const handleToggle = useCallback(() => {
    if (hasInspector) setExpanded((v) => !v);
  }, [hasInspector]);

  return (
    <FlexColumn className="tree-step">
      <FlexRow
        align="center"
        className={hasInspector ? "tree-step-row" : undefined}
        onClick={hasInspector ? handleToggle : undefined}
      >
        <span className="tree-branch">
          {parentPrefix}
          {branch}
        </span>
        <span className={iconClass}>{icon}</span>
        <span className={`tree-step-name ${iconClass}`}>{displayName}</span>
        {duration && <span className="tree-task-meta">{duration}</span>}
      </FlexRow>
      {outputPreview && step.status === "running" && !expanded ? (
        <span className="tree-step-output">
          {parentPrefix}
          {cont}
          {"   → "}
          {outputPreview}
        </span>
      ) : null}
      {errorPreview && !expanded ? (
        <span className="tree-step-error">
          {parentPrefix}
          {cont}
          {"   ✗ "}
          {errorPreview}
        </span>
      ) : null}
      {expanded && hasInspector ? <StepInspector step={step} /> : null}
    </FlexColumn>
  );
});

StepNode.displayName = "StepNode";

// ---------------------------------------------------------------------------
// Task rendering
// ---------------------------------------------------------------------------

const TaskNode: React.FC<{
  task: TaskState;
  isLast: boolean;
  onToggle: () => void;
}> = memo(({ task, isLast, onToggle }) => {
  const branch = isLast ? "└─ " : "├─ ";
  const cont = isLast ? "   " : "│  ";
  const iconClass = `tree-icon-${task.status}`;
  const icon = ICONS[task.status];

  const duration =
    task.duration !== undefined ? formatDuration(task.duration) : "";
  const stepCount = task.steps.length;
  const completedSteps = task.steps.filter(
    (s) => s.status === "completed"
  ).length;

  if (!task.expanded) {
    return (
      <FlexRow align="center" className="tree-task" onClick={onToggle}>
        <span className="tree-branch">{branch}</span>
        <span className={iconClass}>{icon}</span>
        <span className={`tree-task-name ${iconClass}`}>{task.name}</span>
        {duration && <span className="tree-task-meta">{duration}</span>}
        <span className="tree-task-meta">
          ({completedSteps}/{stepCount} steps)
        </span>
      </FlexRow>
    );
  }

  return (
    <FlexColumn>
      <FlexRow align="center" className="tree-task" onClick={onToggle}>
        <span className="tree-branch">{branch}</span>
        <span className={iconClass}>{icon}</span>
        <span className={`tree-task-name ${iconClass}`}>{task.name}</span>
        {task.status === "waiting" && (
          <span className="tree-task-meta">waiting</span>
        )}
      </FlexRow>
      {task.steps.map((step, i) => (
        <StepNode
          key={step.id}
          step={step}
          isLast={i === task.steps.length - 1}
          parentPrefix={cont}
        />
      ))}
    </FlexColumn>
  );
});

TaskNode.displayName = "TaskNode";

// ---------------------------------------------------------------------------
// Planning log
// ---------------------------------------------------------------------------

const PHASE_ICONS_DONE: Record<string, string> = {
  initialization: "✓",
  generation: "✓",
  validation: "✗",
  complete: "✓"
};

const PHASE_ICONS_ACTIVE: Record<string, string> = {
  initialization: "◐",
  generation: "◐",
  validation: "✗",
  complete: "✓"
};

const PlanningLog: React.FC<{
  entries: PlanningEntry[];
  logs: LogEntry[];
  isActive: boolean;
}> = memo(({ entries, logs, isActive }) => {
  if (entries.length === 0 && logs.length === 0) {
    if (isActive) {
      return (
        <FlexRow align="center" className="tree-planning">
          <span className="tree-icon-running">{ICONS.running}</span>
          <Text>planning</Text>
        </FlexRow>
      );
    }
    return null;
  }

  return (
    <div className="tree-planning-log">
      {entries.map((entry, i) => {
        const isLast = i === entries.length - 1;
        const isRunning = isLast && isActive;
        const statusClass =
          entry.status === "failed"
            ? "tree-icon-failed"
            : entry.status === "success"
            ? "tree-icon-completed"
            : isRunning
            ? "tree-icon-running"
            : "tree-icon-completed";
        const icons = isRunning ? PHASE_ICONS_ACTIVE : PHASE_ICONS_DONE;
        const icon = icons[entry.phase] ?? "○";

        return (
          <div key={i} className="tree-planning-entry">
            <span className={statusClass}>{icon}</span>
            <span className={`tree-planning-phase ${statusClass}`}>
              {entry.phase}
            </span>
            <span className="tree-planning-content">
              {entry.content}
            </span>
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

  const completedCount = useMemo(
    () => state.tasks.filter((t) => t.status === "completed").length,
    [state.tasks]
  );

  if (state.phase === "idle") return null;

  const hasTasks = state.tasks.length > 0;

  return (
    <div css={treeStyles(theme)}>
      {/* Planning trace is a live indicator — only keep it on screen while
          planning is still running. Once planning is complete, the plan
          tree below is the durable representation. */}
      {state.phase === "planning" && state.planningLog.length > 0 && (
        <PlanningLog
          entries={state.planningLog}
          logs={state.logs}
          isActive={true}
        />
      )}
      {state.phase === "planning" && state.planningLog.length === 0 && (
        <FlexRow align="center" className="tree-planning">
          <span className="tree-icon-running">{ICONS.running}</span>
          <Text>planning</Text>
        </FlexRow>
      )}
      {hasTasks && (
        <>
          <FlexRow align="center" className="tree-plan-header">
            <span className="tree-plan-icon">{ICONS.plan}</span>
            <span className="tree-plan-label">Plan</span>
            <span className="tree-plan-count">
              ({completedCount}/{state.tasks.length} tasks)
            </span>
          </FlexRow>
          <FlexColumn>
            {state.tasks.map((task, i) => (
              <TaskNode
                key={task.id}
                task={task}
                isLast={i === state.tasks.length - 1}
                onToggle={() => onToggleTask(task.id)}
              />
            ))}
          </FlexColumn>
        </>
      )}
    </div>
  );
};

export default memo(ExecutionTree);

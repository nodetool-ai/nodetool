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

import React, { memo, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Text, FlexRow, FlexColumn } from "../ui_primitives";
import type {
  ExecutionTreeState,
  TaskState,
  StepState,
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
      color: theme.vars.palette.warning.main
    },

    ".tree-planning-text": {
      color: theme.vars.palette.text.secondary,
      fontSize: "0.75rem",
      marginLeft: "0.25rem"
    },

    ".tree-planning-log": {
      display: "flex",
      flexDirection: "column",
      gap: "0.15rem",
      marginBottom: "0.5rem"
    },

    ".tree-planning-entry": {
      display: "flex",
      alignItems: "baseline",
      gap: "0.5rem"
    },

    ".tree-planning-phase": {
      fontSize: "0.75rem",
      fontWeight: 600,
      textTransform: "capitalize",
      minWidth: "5rem",
      flexShrink: 0
    },

    ".tree-planning-content": {
      color: theme.vars.palette.text.secondary,
      fontSize: "0.75rem",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },

    ".tree-log-entry": {
      color: theme.vars.palette.text.disabled,
      fontSize: "0.7rem",
      paddingLeft: "1.5rem"
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

const StepNode: React.FC<{
  step: StepState;
  isLast: boolean;
  parentPrefix: string;
}> = memo(({ step, isLast, parentPrefix }) => {
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
  const errorPreview = step.error ? step.error.slice(0, 120) : "";

  return (
    <FlexColumn>
      <FlexRow align="center">
        <span className="tree-branch">
          {parentPrefix}
          {branch}
        </span>
        <span className={iconClass}>{icon}</span>
        <span className={`tree-step-name ${iconClass}`}>{displayName}</span>
        {duration && <span className="tree-task-meta">{duration}</span>}
      </FlexRow>
      {outputPreview && step.status === "running" ? (
        <span className="tree-step-output">
          {parentPrefix}
          {cont}
          {"   → "}
          {outputPreview}
        </span>
      ) : null}
      {errorPreview ? (
        <span className="tree-step-error">
          {parentPrefix}
          {cont}
          {"   ✗ "}
          {errorPreview}
        </span>
      ) : null}
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
      {state.planningLog.length > 0 && (
        <PlanningLog
          entries={state.planningLog}
          logs={state.logs}
          isActive={state.phase === "planning"}
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

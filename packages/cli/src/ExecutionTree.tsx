/**
 * ExecutionTree — Ink component that renders the agent task/step hierarchy
 * as an interactive tree with real-time updates.
 *
 * ◆ Plan: Research and summarize topic
 * ├─ ✓ Task 1: Search for sources              3.2s (3 steps)
 * ├─ ◐ Task 2: Analyze findings
 * │  ├─ ✓ google_search("topic")
 * │  │    → Found 5 results
 * │  └─ ◐ llm_call
 * │       → The key themes emerging from...
 * └─ ○ Task 3: Write summary                   waiting
 */

import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { ExecutionState, TaskState, StepState } from "./useExecutionState.js";

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const ICONS = {
  waiting: "○",
  running: "◐",
  completed: "✓",
  failed: "✗",
  plan: "◆",
} as const;

const STATUS_COLORS = {
  waiting: "gray",
  running: "yellow",
  completed: "green",
  failed: "red",
} as const;

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

function StepNode({
  step,
  isLast,
  parentPrefix,
}: {
  step: StepState;
  isLast: boolean;
  parentPrefix: string;
}) {
  const branch = isLast ? "└─ " : "├─ ";
  const cont = isLast ? "   " : "│  ";
  const color = STATUS_COLORS[step.status];
  const icon = ICONS[step.status];

  // Display name: prefer tool call info, fall back to step name
  const displayName = step.toolName
    ? step.toolArgs
      ? `${step.toolName}(${step.toolArgs.slice(0, 50)})`
      : step.toolName
    : step.name.slice(0, 60);

  const duration = step.duration !== undefined ? ` ${formatDuration(step.duration)}` : "";

  const outputPreview = truncateOutput(step.output);
  const errorPreview = step.error ? step.error.slice(0, 120) : "";

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="gray" dimColor>{parentPrefix}{branch}</Text>
        {step.status === "running" ? (
          <Text color={color}><Spinner type="dots" /> </Text>
        ) : (
          <Text color={color}>{icon} </Text>
        )}
        <Text color={color}>{displayName}</Text>
        {duration ? <Text color="gray" dimColor>{duration}</Text> : null}
      </Box>
      {outputPreview && step.status === "running" ? (
        <Box>
          <Text color="gray" dimColor>
            {parentPrefix}{cont}   {"→ "}{outputPreview}
          </Text>
        </Box>
      ) : null}
      {errorPreview ? (
        <Box>
          <Text color="red">
            {parentPrefix}{cont}   {"✗ "}{errorPreview}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Task rendering
// ---------------------------------------------------------------------------

function TaskNode({
  task,
  isLast,
  isSelected,
  treeActive,
}: {
  task: TaskState;
  isLast: boolean;
  isSelected: boolean;
  treeActive: boolean;
}) {
  const branch = isLast ? "└─ " : "├─ ";
  const cont = isLast ? "   " : "│  ";
  const color = STATUS_COLORS[task.status];
  const icon = ICONS[task.status];

  const duration = task.duration !== undefined ? formatDuration(task.duration) : "";
  const stepCount = task.steps.length;
  const completedSteps = task.steps.filter((s) => s.status === "completed").length;

  // Collapsed view for completed tasks
  if (!task.expanded) {
    return (
      <Box>
        <Text color="gray" dimColor>{branch}</Text>
        {treeActive && isSelected ? <Text color="cyan" bold>{"› "}</Text> : null}
        {task.status === "running" ? (
          <Text color={color}><Spinner type="dots" /> </Text>
        ) : (
          <Text color={color}>{icon} </Text>
        )}
        <Text color={color} bold>{task.name}</Text>
        {duration ? <Text color="gray" dimColor>  {duration}</Text> : null}
        <Text color="gray" dimColor>  ({completedSteps}/{stepCount} steps)</Text>
      </Box>
    );
  }

  // Expanded view
  return (
    <Box flexDirection="column">
      <Box>
        <Text color="gray" dimColor>{branch}</Text>
        {treeActive && isSelected ? <Text color="cyan" bold>{"› "}</Text> : null}
        {task.status === "running" ? (
          <Text color={color}><Spinner type="dots" /> </Text>
        ) : (
          <Text color={color}>{icon} </Text>
        )}
        <Text color={color} bold>{task.name}</Text>
        {task.status === "waiting" ? (
          <Text color="gray" dimColor>  waiting</Text>
        ) : null}
      </Box>
      {task.steps.map((step, i) => (
        <StepNode
          key={step.id}
          step={step}
          isLast={i === task.steps.length - 1}
          parentPrefix={cont}
        />
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Planning phase
// ---------------------------------------------------------------------------

function PlanningPhase({ content }: { content: string }) {
  return (
    <Box>
      <Text color="yellow"><Spinner type="dots" /> </Text>
      <Text color="yellow">planning</Text>
      {content ? (
        <Text color="gray" dimColor>  {content.slice(0, 60)}</Text>
      ) : null}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main tree
// ---------------------------------------------------------------------------

export function ExecutionTree({
  state,
  treeActive,
}: {
  state: ExecutionState;
  treeActive: boolean;
}) {
  if (state.phase === "idle") return null;

  if (state.phase === "planning") {
    return (
      <Box flexDirection="column" marginTop={1}>
        <PlanningPhase content={state.planningContent} />
      </Box>
    );
  }

  // executing or done
  const maxRows = Math.max((process.stdout.rows ?? 24) - 4, 8);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="cyan">{ICONS.plan} </Text>
        <Text color="cyan" bold>Plan</Text>
        <Text color="gray" dimColor>
          {" "}({state.tasks.filter((t) => t.status === "completed").length}/{state.tasks.length} tasks)
        </Text>
      </Box>
      <Box flexDirection="column">
        {state.tasks.slice(0, maxRows).map((task, i) => (
          <TaskNode
            key={task.id}
            task={task}
            isLast={i === state.tasks.length - 1}
            isSelected={i === state.selectedIndex}
            treeActive={treeActive}
          />
        ))}
      </Box>
    </Box>
  );
}

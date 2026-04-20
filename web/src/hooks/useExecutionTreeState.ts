/**
 * useExecutionTreeState — Builds an ExecutionTree state from chat Messages.
 *
 * Ported from the CLI's useExecutionState hook. Instead of processing
 * streaming messages one-at-a-time, this hook derives the tree state
 * from the full array of Message objects stored in GlobalChatStore.
 */

import { useMemo, useState, useCallback } from "react";
import type {
  Message,
  TaskUpdate,
  StepResult,
  ToolCallUpdate,
  PlanningUpdate
} from "../stores/ApiTypes";
import type { StepToolCall } from "../stores/GlobalChatStore";

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

export type StepStatus = "waiting" | "running" | "completed" | "failed";
export type TaskStatus = "waiting" | "running" | "completed" | "failed";

export interface StepToolCallEntry {
  id?: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  message?: string;
}

export interface StepState {
  id: string;
  name: string;
  status: StepStatus;
  /** Full step instructions as planned — available from task_update. */
  instructions?: string;
  /** Last-seen tool name/args (kept for the one-line tree row). */
  toolName?: string;
  toolArgs?: string;
  /** Truncated preview shown inline in the tree. */
  output: string;
  /** Full step result (unbounded). Used by the inspector. */
  rawResult?: unknown;
  /** All tool calls observed for this step, in order. */
  toolCalls: StepToolCallEntry[];
  error?: string;
  startedAt?: number;
  duration?: number;
}

export interface TaskState {
  id: string;
  name: string;
  status: TaskStatus;
  startedAt?: number;
  duration?: number;
  steps: StepState[];
  expanded: boolean;
  toolCalls: StepToolCall[];
}

export interface PlanningEntry {
  phase: string;
  status: string;
  content: string;
}

export interface LogEntry {
  nodeId: string;
  content: string;
  severity: string;
}

export interface ExecutionTreeState {
  phase: "idle" | "planning" | "executing" | "done";
  planningContent: string;
  planningLog: PlanningEntry[];
  logs: LogEntry[];
  tasks: TaskState[];
}

// ---------------------------------------------------------------------------
// Message normalization (same as AgentExecutionView)
// ---------------------------------------------------------------------------

function normalizeContent(msg: Message): {
  content: unknown;
  eventType: string | null | undefined;
} {
  let content: unknown = msg.content;
  let eventType = msg.execution_event_type;

  if (typeof content === "string") {
    try {
      content = JSON.parse(content);
      if (typeof content === "string") {
        try {
          content = JSON.parse(content);
        } catch {
          /* keep as string */
        }
      }
    } catch {
      /* keep as string */
    }
  }

  if (!eventType && content && typeof content === "object") {
    eventType = (content as Record<string, unknown>).type as string | undefined;
  }

  return { content, eventType };
}

// ---------------------------------------------------------------------------
// Build tree state from messages
// ---------------------------------------------------------------------------

export function buildExecutionTreeState(
  messages: Message[],
  toolCallsByStep?: Record<string, StepToolCall[]>
): ExecutionTreeState {
  const state: ExecutionTreeState = {
    phase: "idle",
    planningContent: "",
    planningLog: [],
    logs: [],
    tasks: []
  };

  const taskMap = new Map<string, TaskState>();
  const activeSteps = new Map<string, string>(); // taskId -> stepId

  for (const msg of messages) {
    if (msg.role !== "agent_execution") continue;
    const { content, eventType } = normalizeContent(msg);

    if (eventType === "planning_update") {
      const pu = content as PlanningUpdate;
      state.phase = "planning";
      if (pu.content) state.planningContent = pu.content;
      state.planningLog.push({
        phase: pu.phase ?? "",
        status: pu.status ?? "",
        content: pu.content ?? ""
      });
      if (pu.status === "Failed" && pu.phase === "complete") state.phase = "done";
      continue;
    }

    if (eventType === "log_update") {
      const lu = content as { node_id?: string; content?: string; severity?: string };
      state.logs.push({
        nodeId: lu.node_id ?? "",
        content: typeof lu.content === "string" ? lu.content : JSON.stringify(lu.content),
        severity: lu.severity ?? "info"
      });
      continue;
    }

    if (eventType === "task_update") {
      const tu = content as TaskUpdate;
      const taskId = tu.task?.id ?? "";
      const event = tu.event;

      if (event === "task_created") {
        if (!taskMap.has(taskId)) {
          const steps: StepState[] = (tu.task?.steps ?? []).map((s) => ({
            id: s.id ?? "",
            name: s.instructions?.slice(0, 80) ?? s.id ?? "",
            status: "waiting" as StepStatus,
            instructions: s.instructions ?? undefined,
            output: "",
            toolCalls: []
          }));
          const task: TaskState = {
            id: taskId,
            name: tu.task?.title ?? taskId,
            status: "running",
            startedAt: Date.now(),
            steps,
            expanded: true,
            toolCalls: []
          };
          taskMap.set(taskId, task);
        }
        state.phase = "executing";
      } else if (event === "step_started") {
        const task = taskMap.get(taskId);
        if (task) {
          const stepId = tu.step?.id ?? "";
          const stepIdx = task.steps.findIndex((s) => s.id === stepId);
          if (stepIdx !== -1) {
            task.steps[stepIdx] = {
              ...task.steps[stepIdx],
              status: "running",
              startedAt: Date.now()
            };
          } else if (stepId) {
            task.steps.push({
              id: stepId,
              name: tu.step?.instructions?.slice(0, 80) ?? stepId,
              status: "running",
              startedAt: Date.now(),
              instructions: tu.step?.instructions ?? undefined,
              output: "",
              toolCalls: []
            });
          }
          task.status = "running";
          activeSteps.set(taskId, stepId);
        }
      } else if (event === "step_completed" || event === "step_failed") {
        const task = taskMap.get(taskId);
        if (task) {
          const stepId = tu.step?.id ?? "";
          const stepIdx = task.steps.findIndex((s) => s.id === stepId);
          if (stepIdx !== -1) {
            const step = task.steps[stepIdx];
            task.steps[stepIdx] = {
              ...step,
              status: event === "step_completed" ? "completed" : "failed",
              duration: step.startedAt
                ? (Date.now() - step.startedAt) / 1000
                : undefined
            };
          }
        }
      } else if (event === "task_completed") {
        const task = taskMap.get(taskId);
        if (task) {
          task.status = "completed";
          task.expanded = false;
          task.duration = task.startedAt
            ? (Date.now() - task.startedAt) / 1000
            : undefined;
          activeSteps.delete(taskId);
        }
      }
      continue;
    }

    if (eventType === "tool_call_update") {
      const tc = content as ToolCallUpdate;
      const stepId = tc.node_id ?? tc.step_id;
      if (!stepId) continue;

      for (const task of taskMap.values()) {
        const stepIdx = task.steps.findIndex((s) => s.id === stepId);
        if (stepIdx !== -1) {
          const argsStr = Object.entries(tc.args ?? {})
            .map(([k, v]) => {
              const val = typeof v === "string" ? v : JSON.stringify(v);
              return `${k}: ${val.slice(0, 40)}`;
            })
            .join(", ");
          const prev = task.steps[stepIdx];
          const callId = tc.tool_call_id ?? undefined;
          const existingIdx = callId
            ? prev.toolCalls.findIndex((c) => c.id === callId)
            : -1;
          const entry: StepToolCallEntry = {
            id: callId,
            name: tc.name ?? "",
            args: (tc.args ?? {}) as Record<string, unknown>,
            message: tc.message ?? undefined
          };
          const nextCalls =
            existingIdx !== -1
              ? prev.toolCalls.map((c, i) => (i === existingIdx ? { ...c, ...entry } : c))
              : [...prev.toolCalls, entry];
          task.steps[stepIdx] = {
            ...prev,
            toolName: tc.name,
            toolArgs: argsStr,
            toolCalls: nextCalls,
            status: "running"
          };
          break;
        }
      }
      continue;
    }

    if (eventType === "step_result") {
      const sr = content as StepResult;
      const stepId = sr.step?.id;
      if (!stepId) continue;

      for (const task of taskMap.values()) {
        const stepIdx = task.steps.findIndex((s) => s.id === stepId);
        if (stepIdx !== -1) {
          const result =
            typeof sr.result === "string"
              ? sr.result
              : JSON.stringify(sr.result ?? "");
          const rawErr: unknown = sr.error;
          const errorText =
            rawErr == null
              ? undefined
              : typeof rawErr === "string"
                ? rawErr
                : rawErr instanceof Error
                  ? rawErr.message
                  : JSON.stringify(rawErr);
          task.steps[stepIdx] = {
            ...task.steps[stepIdx],
            output: result.slice(0, 200),
            rawResult: sr.result,
            status: errorText ? "failed" : "completed",
            error: errorText
          };
          break;
        }
      }
      continue;
    }
  }

  // Attach tool calls from GlobalChatStore
  if (toolCallsByStep) {
    for (const task of taskMap.values()) {
      for (const step of task.steps) {
        const calls = toolCallsByStep[step.id];
        if (calls && calls.length > 0) {
          step.toolName = calls[calls.length - 1].name;
        }
      }
    }
  }

  // Check if all tasks are completed
  const tasks = Array.from(taskMap.values());
  if (
    tasks.length > 0 &&
    tasks.every((t) => t.status === "completed" || t.status === "failed")
  ) {
    state.phase = "done";
  }

  state.tasks = tasks;
  return state;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useExecutionTreeState(
  messages: Message[],
  toolCallsByStep?: Record<string, StepToolCall[]>
) {
  const [expandOverrides, setExpandOverrides] = useState<
    Map<string, boolean>
  >(new Map());

  const treeState = useMemo(
    () => buildExecutionTreeState(messages, toolCallsByStep),
    [messages, toolCallsByStep]
  );

  // Apply expand overrides
  const stateWithOverrides = useMemo(() => {
    if (expandOverrides.size === 0) return treeState;
    return {
      ...treeState,
      tasks: treeState.tasks.map((task) => {
        const override = expandOverrides.get(task.id);
        if (override !== undefined) {
          return { ...task, expanded: override };
        }
        return task;
      })
    };
  }, [treeState, expandOverrides]);

  const toggleExpand = useCallback((taskId: string) => {
    setExpandOverrides((prev) => {
      const next = new Map(prev);
      const current = next.get(taskId);
      // If no override, the default from buildState is used — toggle opposite
      next.set(taskId, current === undefined ? false : !current);
      return next;
    });
  }, []);

  return { state: stateWithOverrides, toggleExpand };
}

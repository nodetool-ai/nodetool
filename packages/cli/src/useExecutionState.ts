/**
 * useExecutionState — Tracks agent task/step hierarchy from ProcessingMessages.
 *
 * Processes interleaved messages from parallel task execution and maintains
 * a structured tree state for rendering by ExecutionTree.
 */

import { useCallback, useRef, useState } from "react";
import type {
  ProcessingMessage,
  TaskUpdate,
  StepResult,
  ToolCallUpdate,
  Chunk,
  PlanningUpdate,
} from "@nodetool/protocol";
import { TaskUpdateEvent } from "@nodetool/protocol";

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

export type StepStatus = "waiting" | "running" | "completed" | "failed";
export type TaskStatus = "waiting" | "running" | "completed" | "failed";

export interface StepState {
  id: string;
  name: string;
  status: StepStatus;
  toolName?: string;
  toolArgs?: string;
  output: string;
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
}

export interface ExecutionState {
  phase: "idle" | "planning" | "executing" | "done";
  planningContent: string;
  tasks: TaskState[];
  selectedIndex: number;
}

const INITIAL_STATE: ExecutionState = {
  phase: "idle",
  planningContent: "",
  tasks: [],
  selectedIndex: 0,
};

// Max chars to keep in step output preview
const MAX_OUTPUT_LENGTH = 200;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useExecutionState() {
  const [state, setState] = useState<ExecutionState>({ ...INITIAL_STATE });
  // Track which step is "active" per task for routing chunks
  const activeStepRef = useRef<Map<string, string>>(new Map());

  const reset = useCallback(() => {
    setState({ ...INITIAL_STATE });
    activeStepRef.current.clear();
  }, []);

  const processMessage = useCallback(
    (msg: ProcessingMessage) => {
      switch (msg.type) {
        case "planning_update": {
          const pu = msg as unknown as PlanningUpdate;
          setState((prev) => ({
            ...prev,
            phase: "planning",
            planningContent: pu.content ?? prev.planningContent,
          }));
          break;
        }

        case "task_update": {
          const tu = msg as unknown as TaskUpdate;
          setState((prev) => {
            const tasks = [...prev.tasks];

            if (tu.event === TaskUpdateEvent.TaskCreated) {
              const existingIdx = tasks.findIndex(
                (t) => t.id === tu.task.id
              );
              if (existingIdx === -1) {
                const steps: StepState[] = (tu.task.steps ?? []).map((s) => ({
                  id: s.id ?? "",
                  name: s.instructions?.slice(0, 60) ?? s.id ?? "",
                  status: "waiting" as StepStatus,
                  output: "",
                }));
                tasks.push({
                  id: tu.task.id ?? "",
                  name: tu.task.title ?? tu.task.name ?? tu.task.id ?? "",
                  status: "running",
                  startedAt: Date.now(),
                  steps,
                  expanded: true,
                });
              }
              return { ...prev, phase: "executing", tasks };
            }

            if (tu.event === TaskUpdateEvent.StepStarted) {
              const taskIdx = tasks.findIndex((t) => t.id === tu.task.id);
              if (taskIdx !== -1) {
                const task = { ...tasks[taskIdx], steps: [...tasks[taskIdx].steps] };
                const stepIdx = task.steps.findIndex(
                  (s) => s.id === tu.step?.id
                );
                if (stepIdx !== -1) {
                  task.steps[stepIdx] = {
                    ...task.steps[stepIdx],
                    status: "running",
                    startedAt: Date.now(),
                  };
                } else if (tu.step?.id) {
                  // Step not in initial plan — add dynamically
                  task.steps.push({
                    id: tu.step.id,
                    name: tu.step.instructions?.slice(0, 60) ?? tu.step.id,
                    status: "running",
                    startedAt: Date.now(),
                    output: "",
                  });
                }
                task.status = "running";
                tasks[taskIdx] = task;
                activeStepRef.current.set(task.id, tu.step?.id ?? "");
              }
              return { ...prev, tasks };
            }

            if (
              tu.event === TaskUpdateEvent.StepCompleted ||
              tu.event === TaskUpdateEvent.StepFailed
            ) {
              const taskIdx = tasks.findIndex((t) => t.id === tu.task.id);
              if (taskIdx !== -1) {
                const task = { ...tasks[taskIdx], steps: [...tasks[taskIdx].steps] };
                const stepIdx = task.steps.findIndex(
                  (s) => s.id === tu.step?.id
                );
                if (stepIdx !== -1) {
                  const step = task.steps[stepIdx];
                  const now = Date.now();
                  task.steps[stepIdx] = {
                    ...step,
                    status:
                      tu.event === TaskUpdateEvent.StepCompleted
                        ? "completed"
                        : "failed",
                    duration: step.startedAt
                      ? (now - step.startedAt) / 1000
                      : undefined,
                  };
                }
                tasks[taskIdx] = task;
              }
              return { ...prev, tasks };
            }

            if (tu.event === TaskUpdateEvent.TaskCompleted) {
              const taskIdx = tasks.findIndex((t) => t.id === tu.task.id);
              if (taskIdx !== -1) {
                const task = tasks[taskIdx];
                const now = Date.now();
                tasks[taskIdx] = {
                  ...task,
                  status: "completed",
                  expanded: false,
                  duration: task.startedAt
                    ? (now - task.startedAt) / 1000
                    : undefined,
                };
                activeStepRef.current.delete(task.id);
              }
              return { ...prev, tasks };
            }

            return prev;
          });
          break;
        }

        case "tool_call_update": {
          const tc = msg as unknown as ToolCallUpdate;
          const stepId = tc.node_id ?? tc.step_id;
          if (!stepId) break;

          setState((prev) => {
            const tasks = prev.tasks.map((task) => {
              const stepIdx = task.steps.findIndex((s) => s.id === stepId);
              if (stepIdx === -1) return task;
              const steps = [...task.steps];
              const argsStr = Object.entries(tc.args ?? {})
                .map(([k, v]) => {
                  const val = typeof v === "string" ? v : JSON.stringify(v);
                  return `${k}: ${val.slice(0, 40)}`;
                })
                .join(", ");
              steps[stepIdx] = {
                ...steps[stepIdx],
                toolName: tc.name,
                toolArgs: argsStr,
                status: "running",
              };
              return { ...task, steps };
            });
            return { ...prev, tasks };
          });
          break;
        }

        case "chunk": {
          const ch = msg as unknown as Chunk;
          const stepId = ch.node_id;
          if (!stepId) break;

          setState((prev) => {
            const tasks = prev.tasks.map((task) => {
              const stepIdx = task.steps.findIndex((s) => s.id === stepId);
              if (stepIdx === -1) return task;
              const steps = [...task.steps];
              const existing = steps[stepIdx].output;
              const newOutput = existing + (ch.content ?? "");
              steps[stepIdx] = {
                ...steps[stepIdx],
                output:
                  newOutput.length > MAX_OUTPUT_LENGTH
                    ? newOutput.slice(-MAX_OUTPUT_LENGTH)
                    : newOutput,
                status: "running",
              };
              return { ...task, steps };
            });
            return { ...prev, tasks };
          });
          break;
        }

        case "step_result": {
          const sr = msg as unknown as StepResult;
          const stepId = sr.step?.id;
          if (!stepId) break;

          setState((prev) => {
            const tasks = prev.tasks.map((task) => {
              const stepIdx = task.steps.findIndex((s) => s.id === stepId);
              if (stepIdx === -1) return task;
              const steps = [...task.steps];
              const result =
                typeof sr.result === "string"
                  ? sr.result
                  : JSON.stringify(sr.result ?? "");
              steps[stepIdx] = {
                ...steps[stepIdx],
                output: result.slice(0, MAX_OUTPUT_LENGTH),
                status: sr.error ? "failed" : "completed",
                error: sr.error ?? undefined,
              };
              return { ...task, steps };
            });
            return { ...prev, tasks };
          });
          break;
        }
      }
    },
    []
  );

  const navigate = useCallback(
    (direction: "up" | "down") => {
      setState((prev) => {
        const max = prev.tasks.length - 1;
        if (max < 0) return prev;
        const next =
          direction === "up"
            ? Math.max(0, prev.selectedIndex - 1)
            : Math.min(max, prev.selectedIndex + 1);
        return { ...prev, selectedIndex: next };
      });
    },
    []
  );

  const toggleExpand = useCallback(() => {
    setState((prev) => {
      const tasks = [...prev.tasks];
      const task = tasks[prev.selectedIndex];
      if (!task) return prev;
      tasks[prev.selectedIndex] = { ...task, expanded: !task.expanded };
      return { ...prev, tasks };
    });
  }, []);

  const markDone = useCallback(() => {
    setState((prev) => ({ ...prev, phase: "done" }));
  }, []);

  return { state, processMessage, navigate, toggleExpand, reset, markDone };
}

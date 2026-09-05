/**
 * Core type definitions for the agent system.
 */

export interface Step {
  id: string;
  instructions: string;
  /**
   * True only when the step produced a valid result. A failed step is
   * terminal but NOT completed — dependents must not run on its output.
   */
  completed: boolean;
  /** True when the step ended without a usable result. Mutually exclusive with {@link completed}. */
  failed?: boolean;
  /** Failure cause, set alongside {@link failed}. */
  error?: string;
  startTime?: number;
  endTime?: number;
  dependsOn: string[];
  tools?: string[];
  outputSchema?: string;
  logs: string[];
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  steps: Step[];
  /** Task IDs this task depends on. Used in multi-task plans for inter-task ordering. */
  dependsOn?: string[];
  /** Whether this task has been completed. Set by ParallelTaskExecutor. */
  completed?: boolean;
}

/**
 * A plan with multiple tasks that can be executed in parallel.
 * Tasks form a DAG via their `dependsOn` arrays. Independent tasks
 * run concurrently as sub-agents, each with their own StepExecutor chain.
 */
export interface TaskPlan {
  title: string;
  tasks: Task[];
}

/**
 * ProcessingContext variable key under which a host publishes the
 * `PermissionGateOptions` every loop under it must gate through. Declared in
 * `@nodetool-ai/runtime` so the workflow hosts below this package can set a
 * gate on the context they build; re-exported here for every existing import.
 * Read it with `gateFromContext`, never directly.
 */
export { PERMISSION_GATE_CONTEXT_KEY } from "@nodetool-ai/runtime";

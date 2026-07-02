/**
 * Core type definitions for the agent system.
 */

export interface Step {
  id: string;
  instructions: string;
  completed: boolean;
  startTime?: number;
  endTime?: number;
  dependsOn: string[];
  tools?: string[];
  outputSchema?: string;
  logs: string[];
  /** Step execution mode: discover produces a list, process fans out over it, aggregate collects. */
  mode?: "discover" | "process" | "aggregate";
  /** Template with {field} placeholders, rendered per item for process-mode fan-out. */
  perItemInstructions?: string;
  /** JSON schema string applied to each ephemeral step's output in process mode. */
  perItemSchema?: string;
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
 * User decision on a proposed {@link TaskPlan}. A rejection may carry
 * feedback; the agent replans with it (bounded) instead of aborting.
 */
export type PlanApprovalDecision =
  | { decision: "approve" }
  | { decision: "reject"; feedback?: string };

/**
 * Callback a host wires in to gate execution on user plan approval.
 * Called after planning with the proposed plan; execution proceeds only on
 * an approve decision.
 */
export type RequestPlanApproval = (
  plan: TaskPlan
) => Promise<PlanApprovalDecision>;

/**
 * ProcessingContext variable key under which hosts (e.g. the websocket
 * runner) expose a {@link RequestPlanApproval} callback. `Agent.execute`
 * falls back to this when no `requestPlanApproval` option was passed, so
 * plan gating reaches agents buried inside workflow nodes without explicit
 * wiring at every construction site.
 */
export const PLAN_APPROVAL_CONTEXT_KEY = "request_plan_approval";

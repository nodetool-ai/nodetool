/**
 * Core type definitions for the agent system.
 */

/**
 * Agent execution mode:
 * - "loop": Simple iterative LLM + tool calling loop (like SimpleAgent)
 * - "plan": LLM creates a task plan, then executes steps (like Agent)
 * - "multi-agent": Multiple sub-agents running in parallel (like TeamExecutor)
 */
export type AgentMode = "loop" | "plan" | "multi-agent";

/**
 * Configuration for a sub-agent in multi-agent mode.
 * Used when auto-specializing agents from an objective.
 */
export interface SubAgentConfig {
  /** Human-readable name for the sub-agent. */
  name: string;
  /** Role description for the sub-agent. */
  role: string;
  /** Skill tags for task matching. */
  skills: string[];
  /** Tool names this sub-agent can use (beyond team tools). */
  tools?: string[];
  /** Override model for this sub-agent. If not set, uses the parent agent's model. */
  model?: string;
  /** Override provider for this sub-agent. If not set, uses the parent agent's provider. */
  provider?: string;
}

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

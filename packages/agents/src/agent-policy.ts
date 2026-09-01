/**
 * The default bounds the two DAG executors fall back to.
 *
 * `DEFAULT_AGENT_POLICY` is what `parallel-task-executor.ts` and
 * `task-executor.ts` read when a caller names no bound of its own, which keeps
 * one number in one place instead of a literal per executor.
 *
 * `resolveAgentPolicy` and `AgentPolicyOptions` have no caller left: the loop
 * that resolved a per-run policy object is gone, and `execute_plan` passes the
 * run's budget and the parent's per-step iteration cap directly. A7 folds the
 * per-step iteration bound into `RunBudget`, which today carries a concurrency
 * semaphore but no iteration cap; these stay until it does.
 */

export interface AgentPolicyOptions {
  /** Plan size: maximum step dispatch rounds per task. */
  maxSteps?: number;
  /** Tool-call rounds per step, i.e. the per-step provider turn budget. */
  maxStepIterations?: number;
  /** Output-token cap per provider turn. Undefined lets the provider decide. */
  maxTokens?: number;
  /** Concurrent sub-agents (task and step fan-out dispatch). */
  maxConcurrentAgents?: number;
}

export interface AgentPolicy {
  maxSteps: number;
  maxStepIterations: number;
  maxTokens?: number;
  maxConcurrentAgents: number;
}

export const DEFAULT_AGENT_POLICY: AgentPolicy = {
  maxSteps: 10,
  maxStepIterations: 15,
  maxConcurrentAgents: 8
};

export function resolveAgentPolicy(opts: AgentPolicyOptions = {}): AgentPolicy {
  const policy: AgentPolicy = {
    maxSteps: opts.maxSteps ?? DEFAULT_AGENT_POLICY.maxSteps,
    maxStepIterations:
      opts.maxStepIterations ?? DEFAULT_AGENT_POLICY.maxStepIterations,
    maxConcurrentAgents:
      opts.maxConcurrentAgents ?? DEFAULT_AGENT_POLICY.maxConcurrentAgents
  };
  if (opts.maxTokens !== undefined) policy.maxTokens = opts.maxTokens;
  return policy;
}

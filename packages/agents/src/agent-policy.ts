/**
 * The default bounds the two DAG executors fall back to.
 *
 * `DEFAULT_AGENT_POLICY` is what `parallel-task-executor.ts` and
 * `task-executor.ts` read when a caller names no bound of its own, which keeps
 * one number in one place instead of a literal per executor. It carried a
 * `maxSteps` — dispatch rounds per task — until the executors became
 * event-driven (`utils/dag-scheduler.ts`); nothing counts rounds now.
 *
 * `resolveAgentPolicy` and `AgentPolicyOptions` have no caller left: the loop
 * that resolved a per-run policy object is gone, and `execute_plan` passes the
 * run's budget and the parent's per-step iteration cap directly. The per-step
 * iteration cap stays here rather than on `RunBudget`, which carries a
 * concurrency semaphore and no iteration bound.
 */

export interface AgentPolicyOptions {
  /** Tool-call rounds per step, i.e. the per-step provider turn budget. */
  maxStepIterations?: number;
  /** Output-token cap per provider turn. Undefined lets the provider decide. */
  maxTokens?: number;
  /** Concurrent sub-agents (task and step fan-out dispatch). */
  maxConcurrentAgents?: number;
}

export interface AgentPolicy {
  maxStepIterations: number;
  maxTokens?: number;
  maxConcurrentAgents: number;
}

export const DEFAULT_AGENT_POLICY: AgentPolicy = {
  maxStepIterations: 15,
  maxConcurrentAgents: 8
};

export function resolveAgentPolicy(opts: AgentPolicyOptions = {}): AgentPolicy {
  const policy: AgentPolicy = {
    maxStepIterations:
      opts.maxStepIterations ?? DEFAULT_AGENT_POLICY.maxStepIterations,
    maxConcurrentAgents:
      opts.maxConcurrentAgents ?? DEFAULT_AGENT_POLICY.maxConcurrentAgents
  };
  if (opts.maxTokens !== undefined) policy.maxTokens = opts.maxTokens;
  return policy;
}

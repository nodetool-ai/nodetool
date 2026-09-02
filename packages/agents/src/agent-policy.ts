/**
 * The default bounds the two DAG executors fall back to.
 *
 * `maxConcurrentAgents` is the one field the executors read from here.
 * `maxStepIterations` reaches neither: `parallel-task-executor.ts` and
 * `task-executor.ts` each declare their own `DEFAULT_MAX_STEP_ITERATIONS` and
 * fall back to that, so the value below is not the per-step default any caller
 * gets. `DEFAULT_AGENT_POLICY` also carried a `maxSteps` — dispatch rounds per
 * task — until the executors became event-driven (`utils/dag-scheduler.ts`);
 * nothing counts rounds now.
 *
 * `resolveAgentPolicy` and `AgentPolicyOptions` have no caller left: the loop
 * that resolved a per-run policy object is gone, and `execute_plan` passes the
 * run's budget and the parent's per-step iteration cap directly.
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

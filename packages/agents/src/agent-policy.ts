/**
 * AgentPolicy — the one execution policy every agent mode obeys.
 *
 * The four planning modes (single task, multi-task plan, orchestration script,
 * graph) used to carry their own ad-hoc bounds: `maxTokens` reached the
 * task-plan executors but not the script or graph runners, `maxSteps` was
 * ignored once a plan had more than one task, fan-out was capped in script mode
 * only, and the plan-approval gate ran for multi-task plans alone. Nodes that
 * wrap an agent hardcoded their own numbers on top.
 *
 * One object resolves all of it, so a knob means the same thing in every mode
 * and a new mode inherits the bounds instead of inventing them.
 */

export interface AgentPolicyOptions {
  /** Plan size: maximum step dispatch rounds per task. */
  maxSteps?: number;
  /** Tool-call rounds per step, i.e. the per-step provider turn budget. */
  maxStepIterations?: number;
  /** Output-token cap per provider turn. Undefined lets the provider decide. */
  maxTokens?: number;
  /** Concurrent sub-agents (script `agent()` calls, task and fan-out dispatch). */
  maxConcurrentAgents?: number;
  /** Lifetime sub-agent call cap per run. */
  maxAgentCalls?: number;
}

export interface AgentPolicy {
  maxSteps: number;
  maxStepIterations: number;
  maxTokens?: number;
  maxConcurrentAgents: number;
  maxAgentCalls: number;
}

export const DEFAULT_AGENT_POLICY: AgentPolicy = {
  maxSteps: 10,
  maxStepIterations: 15,
  maxConcurrentAgents: 8,
  maxAgentCalls: 100
};

export function resolveAgentPolicy(opts: AgentPolicyOptions = {}): AgentPolicy {
  const policy: AgentPolicy = {
    maxSteps: opts.maxSteps ?? DEFAULT_AGENT_POLICY.maxSteps,
    maxStepIterations:
      opts.maxStepIterations ?? DEFAULT_AGENT_POLICY.maxStepIterations,
    maxConcurrentAgents:
      opts.maxConcurrentAgents ?? DEFAULT_AGENT_POLICY.maxConcurrentAgents,
    maxAgentCalls: opts.maxAgentCalls ?? DEFAULT_AGENT_POLICY.maxAgentCalls
  };
  if (opts.maxTokens !== undefined) policy.maxTokens = opts.maxTokens;
  return policy;
}

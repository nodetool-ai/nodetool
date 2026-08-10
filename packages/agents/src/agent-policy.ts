/**
 * AgentPolicy — the one execution policy every agent mode obeys.
 *
 * The three planning modes (single task, multi-task plan, graph) used to carry
 * their own ad-hoc bounds: `maxTokens` reached the task-plan executors but not
 * the graph runner, `maxSteps` was ignored once a plan had more than one task,
 * and the plan-approval gate ran for multi-task plans alone. Nodes that wrap an
 * agent hardcoded their own numbers on top.
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

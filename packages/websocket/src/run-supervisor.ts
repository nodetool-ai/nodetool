/**
 * Builds the `SupervisorHandle` a supervised run gets, for every server-side
 * entry point that starts one (the websocket runner, the headless/trigger
 * runner).
 *
 * Supervision is opt-in and stays opt-in: this returns `null` for anything
 * short of an explicit `supervise: true` plus a resolvable model, and a run
 * without a handle constructs no escalation at all. A misconfiguration
 * therefore degrades to today's behavior rather than failing the run — the
 * fail-closed rule the whole design follows.
 *
 * See docs/workflow-supervisor-design.md §7 entry point 4.
 */

import { createLogger } from "@nodetool-ai/config";
import { SupervisorAgent } from "@nodetool-ai/agents";
import { BoundedHandle, type SupervisorHandle } from "@nodetool-ai/kernel";
import type { SupervisorRunOptions } from "@nodetool-ai/protocol";
import { getProvider, type ProcessingContext } from "@nodetool-ai/runtime";

const log = createLogger("nodetool.websocket.run-supervisor");

export interface CreateRunSupervisorOptions {
  /** The request's flag. Anything but `true` yields `null`. */
  supervise?: boolean | undefined;
  /** Per-request supervisor configuration. */
  supervisor?: SupervisorRunOptions | null | undefined;
  /** The run's context — used for secrets, memory, and tool execution. */
  context: ProcessingContext;
  /** Server-configured fallbacks when the request names neither. */
  defaultProvider?: string | undefined;
  defaultModel?: string | undefined;
}

/**
 * Resolve the supervising model. Request first, then the caller's configured
 * defaults, then the environment — the last exists for hosts that have no
 * per-connection defaults at all (the trigger dispatcher's headless runs).
 */
function resolveModel(options: CreateRunSupervisorOptions): {
  provider: string;
  model: string;
} | null {
  const provider =
    options.supervisor?.provider ??
    options.defaultProvider ??
    process.env["NODETOOL_SUPERVISOR_PROVIDER"];
  const model =
    options.supervisor?.model ??
    options.defaultModel ??
    process.env["NODETOOL_SUPERVISOR_MODEL"];
  if (!provider || !model) return null;
  return { provider, model };
}

export async function createRunSupervisor(
  options: CreateRunSupervisorOptions
): Promise<SupervisorHandle | null> {
  if (options.supervise !== true) return null;

  const selection = resolveModel(options);
  if (!selection) {
    log.warn(
      "Supervision requested but no supervisor model is configured — running unsupervised"
    );
    return null;
  }

  // A dedicated provider instance, not the one the run's nodes resolve
  // through the context: per-turn spend is reconciled from the provider's own
  // running cost, so a second caller on the same instance would corrupt the
  // supervisor's dollar cap.
  let provider;
  try {
    provider = await getProvider(selection.provider, (key) =>
      options.context.getSecret(key)
    );
  } catch (error) {
    log.warn("Supervisor provider unavailable — running unsupervised", {
      provider: selection.provider,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }

  const agentOptions: ConstructorParameters<typeof SupervisorAgent>[0] = {
    provider,
    model: selection.model,
    // The supervisor shares the run's memory (its `supervisor:` keys belong to
    // the run) but not its listeners: the decision's own provider traffic is
    // not the run's message stream. The kernel emits the escalation and the
    // verdict on the run's context regardless.
    context: options.context.copy({
      shareMemory: true,
      inheritMessageListeners: false
    })
  };
  if (options.supervisor?.cost_cap_usd !== undefined) {
    agentOptions.maxCostUsd = options.supervisor.cost_cap_usd;
  }
  const agent = new SupervisorAgent(agentOptions);

  const bounds: ConstructorParameters<typeof BoundedHandle>[1] = {};
  if (options.supervisor?.max_decisions !== undefined) {
    bounds.maxDecisions = options.supervisor.max_decisions;
  }
  if (options.supervisor?.max_retries_per_node !== undefined) {
    bounds.maxRetriesPerNode = options.supervisor.max_retries_per_node;
  }
  if (options.supervisor?.decision_timeout_ms !== undefined) {
    bounds.decisionTimeoutMs = options.supervisor.decision_timeout_ms;
  }
  return new BoundedHandle(agent, bounds);
}

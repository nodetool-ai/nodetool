/**
 * The CLI's supervisor surface: five flags, one handle, and the lines a
 * supervised run prints.
 *
 * Flag parsing and model-spec resolution are pure so they can be unit-tested
 * without a provider, a database, or a kernel. Everything that needs a
 * provider or the agents package is behind a dynamic import, so an
 * unsupervised run loads none of it.
 *
 * The handle goes to `ExecutionSessionOptions.supervisor` — the one
 * integration point every surface shares (docs/workflow-supervisor-design.md
 * §7). No CLI code touches `WorkflowRunner`.
 */
import {
  formatInterventionLine,
  formatSupervisedSummary,
  summarizeInterventions
} from "@nodetool-ai/execution/debug";
import type { SupervisorHandle } from "@nodetool-ai/execution";
import type { Intervention, ProcessingMessage } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { Command } from "commander";
import { parseNumericOption } from "./numeric-options.js";

/**
 * Model used when `--supervise` is given without `--supervisor-model`.
 * `NODETOOL_SUPERVISOR_MODEL` overrides it.
 */
export const DEFAULT_SUPERVISOR_MODEL = "anthropic/claude-sonnet-4-6";

/** The five flags, as Commander parses them. */
export interface SupervisorCliOptions {
  supervise?: boolean;
  maxDecisions?: string;
  maxRetries?: string;
  supervisorCostCap?: string;
  supervisorModel?: string;
}

/**
 * A validated supervisor configuration. Every bound is optional: an omitted
 * flag means "whatever the kernel's `BoundedHandle` and the `SupervisorAgent`
 * default to", so the defaults live in one place instead of being copied here.
 */
export interface SupervisorRunConfig {
  /** `provider/model`, as written or defaulted. Resolved when the handle is built. */
  modelSpec: string;
  maxDecisions?: number;
  maxRetriesPerNode?: number;
  maxCostUsd?: number;
}

/** Register the supervisor flags on a run-shaped command. */
export function addSupervisorOptions(command: Command): Command {
  return command
    .option(
      "--supervise",
      "Let a supervisor agent decide what to do when a node fails (retry / repair / skip / fail)"
    )
    .option(
      "--max-decisions <n>",
      "Supervisor decisions allowed in this run (default: 10)"
    )
    .option(
      "--max-retries <n>",
      "Supervisor retries allowed per node invocation (default: 2)"
    )
    .option(
      "--supervisor-cost-cap <usd>",
      "Ceiling on supervisor spend for this run, in USD (default: 0.50)"
    )
    .option(
      "--supervisor-model <provider/model>",
      `Model that supervises the run (default: ${DEFAULT_SUPERVISOR_MODEL})`
    );
}

function positiveInt(value: string, flag: string): number {
  return parseNumericOption(value, flag, { integer: true, min: 0 });
}

function positiveNumber(value: string, flag: string): number {
  return parseNumericOption(value, flag, { min: 0 });
}

/**
 * Turn the flags into a config, or `null` when the run is unsupervised.
 *
 * A bound passed without `--supervise` is a mistake worth reporting: it reads
 * as "supervision, bounded", and silently running unsupervised would hide a
 * failure the user asked to be handled.
 */
export function parseSupervisorFlags(
  opts: SupervisorCliOptions
): SupervisorRunConfig | null {
  const bounded =
    opts.maxDecisions !== undefined ||
    opts.maxRetries !== undefined ||
    opts.supervisorCostCap !== undefined ||
    opts.supervisorModel !== undefined;

  if (!opts.supervise) {
    if (bounded) {
      throw new Error(
        "Supervisor options were given without --supervise; add --supervise or drop them."
      );
    }
    return null;
  }

  const config: SupervisorRunConfig = {
    modelSpec:
      opts.supervisorModel ??
      process.env.NODETOOL_SUPERVISOR_MODEL ??
      DEFAULT_SUPERVISOR_MODEL
  };
  if (opts.maxDecisions !== undefined) {
    config.maxDecisions = positiveInt(opts.maxDecisions, "--max-decisions");
  }
  if (opts.maxRetries !== undefined) {
    config.maxRetriesPerNode = positiveInt(opts.maxRetries, "--max-retries");
  }
  if (opts.supervisorCostCap !== undefined) {
    config.maxCostUsd = positiveNumber(
      opts.supervisorCostCap,
      "--supervisor-cost-cap"
    );
  }
  return config;
}

/**
 * Split `provider/model` into its parts.
 *
 * Model ids themselves contain slashes (`openrouter/openai/gpt-5.4-mini`), so
 * the split is decided by the registry rather than by counting separators:
 * the leading segment is the provider only if a provider by that name is
 * registered.
 */
export function parseModelSpec(
  spec: string,
  isRegisteredProvider: (id: string) => boolean
): { providerId: string; model: string } {
  const cut = spec.indexOf("/");
  const head = cut === -1 ? spec : spec.slice(0, cut);
  if (cut === -1 || !isRegisteredProvider(head.toLowerCase())) {
    throw new Error(
      `--supervisor-model must be "<provider>/<model>" with a registered provider ` +
        `(got "${spec}"). Example: anthropic/claude-sonnet-4-6.`
    );
  }
  return { providerId: head.toLowerCase(), model: spec.slice(cut + 1) };
}

export interface SupervisorHandleInit {
  config: SupervisorRunConfig;
  /**
   * The run's context — the supervisor's tools and its `supervisor:` memory
   * keys share it, so a downstream agent can read the decisions back. The
   * *provider* is a fresh instance and is never the run's.
   */
  context: ProcessingContext;
}

export interface BuiltSupervisor {
  handle: SupervisorHandle;
  providerId: string;
  model: string;
}

/**
 * Build the bounded, LLM-backed handle. Imports are dynamic so the agents
 * package and a provider are loaded only for a run that asked for them.
 */
export async function createSupervisorHandle(
  init: SupervisorHandleInit
): Promise<BuiltSupervisor> {
  const [
    { BoundedHandle },
    { SupervisorAgent },
    { listRegisteredProviderIds }
  ] = await Promise.all([
    import("@nodetool-ai/kernel"),
    import("@nodetool-ai/agents"),
    import("@nodetool-ai/runtime")
  ]);
  const { createProviderStrict } = await import("./providers.js");

  const { providerId, model } = parseModelSpec(init.config.modelSpec, (id) =>
    listRegisteredProviderIds().includes(id)
  );
  const provider = await createProviderStrict(providerId);

  const agentOptions: ConstructorParameters<typeof SupervisorAgent>[0] = {
    provider,
    model,
    // The supervisor reads and writes the run's memory (`supervisor:` keys)
    // but must not push its own provider chatter into the run's message
    // stream — the CLI drains that stream for `⛨` lines — so it gets a
    // listener-free copy, matching the agent surface.
    context: init.context.copy({
      shareMemory: true,
      inheritMessageListeners: false
    })
  };
  if (init.config.maxCostUsd !== undefined) {
    agentOptions.maxCostUsd = init.config.maxCostUsd;
  }
  const agent = new SupervisorAgent(agentOptions);

  const bounds: ConstructorParameters<typeof BoundedHandle>[1] = {};
  if (init.config.maxDecisions !== undefined) {
    bounds.maxDecisions = init.config.maxDecisions;
  }
  if (init.config.maxRetriesPerNode !== undefined) {
    bounds.maxRetriesPerNode = init.config.maxRetriesPerNode;
  }
  const handle = new BoundedHandle(agent, bounds);

  return { handle, providerId, model };
}

/**
 * Print one `⛨` line per decision as it happens, by draining the session's
 * message stream. Lines go to stderr so `--json` stdout stays parseable.
 */
export async function streamInterventionLines(
  messages: AsyncIterable<ProcessingMessage>,
  write: (line: string) => void = (line) => console.error(line)
): Promise<void> {
  for await (const message of messages) {
    if (message.type !== "supervisor_decision") continue;
    const intervention: Parameters<typeof formatInterventionLine>[0] = {
      escalation: message.escalation,
      verdict: message.verdict,
      decidedBy: message.decided_by
    };
    if (typeof message.cost === "number") {
      intervention.costUsd = message.cost;
    }
    write(formatInterventionLine(intervention));
  }
}

/** The run's closing supervised line. Nothing is printed for a clean run. */
export function printSupervisedSummary(
  interventions: readonly Intervention[],
  write: (line: string) => void = (line) => console.log(line)
): void {
  if (interventions.length === 0) return;
  write(formatSupervisedSummary(summarizeInterventions(interventions)));
}

export interface SupervisorCostAttribution {
  interventions: readonly Intervention[];
  jobId: string;
  workflowId: string | null;
  userId: string;
  providerId: string;
  model: string;
}

/**
 * Write supervisor spend into the prediction ledger `nodetool costs` reads.
 *
 * One row per decision that cost money, attributed to the run (workflow id,
 * plus the job id in metadata — the ledger has no job column) and tagged
 * `supervisor` in `node_type`, so supervision is separable from the spend of
 * the workflow it supervised. Best-effort: a ledger failure never fails a run
 * that already finished. Returns the number of rows written.
 */
export async function recordSupervisorCost(
  attribution: SupervisorCostAttribution
): Promise<number> {
  const billable = attribution.interventions.filter(
    (i) => typeof i.costUsd === "number" && i.costUsd > 0
  );
  if (billable.length === 0) return 0;

  const { Prediction } = await import("@nodetool-ai/models");
  let written = 0;
  for (const intervention of billable) {
    try {
      await Prediction.create({
        user_id: attribution.userId,
        provider: attribution.providerId,
        model: attribution.model,
        node_id: intervention.escalation.nodeId,
        node_type: "supervisor",
        workflow_id: attribution.workflowId,
        cost: intervention.costUsd,
        status: "completed",
        metadata: {
          kind: "supervisor",
          job_id: attribution.jobId,
          decided_by: intervention.decidedBy,
          verdict: intervention.verdict.action,
          escalated_node_type: intervention.escalation.nodeType
        }
      });
      written += 1;
    } catch (err) {
      console.error(
        `Failed to record supervisor cost: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return written;
}

/** Capability invocation validates arguments and runs the single permission gate. */

import type {
  BaseProvider,
  ProcessingContext,
  RunBudget,
  ProviderTool
} from "@nodetool-ai/runtime";
import { budgetFromContext } from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { VectorCollection } from "@nodetool-ai/vectorstore";
import { injectUserMessageField, Tool } from "../tools/base-tool.js";
import {
  decidePermission,
  type PermissionCategory
} from "../tools/tool-permissions.js";
import { validateCapabilityArgs, withSnakeCaseAliases } from "./args.js";
import { capabilitySpec, capabilityForName } from "./registry.js";
import type {
  AvailableSecretsResolver,
  CapabilityExport,
  CapabilityGate,
  CapabilityLoaders,
  CapabilityRun,
  CapabilitySpec,
  ClientToolRouter,
  SecretPrompt,
  SubAgentRuntime
} from "./types.js";
import type {
  ExampleWorkflowCatalog,
  ModelCatalogs,
  PackageAssetLister,
  ProjectDeleter,
  WorkflowDslExporter,
  WorkflowEnvironmentProvider
} from "../tools/mcp-tools.js";

/** Explicit ungated compatibility runs still use normal validation. */
export const UNGATED: CapabilityGate = {
  mode: "auto",
  sessionAllow: new Set<string>(),
  requestApproval: async () => "allow"
};

/** Compatibility consumers reuse one context-only run per context. */
const ungatedRuns = new WeakMap<ProcessingContext, CapabilityRun>();

export function ungatedCapabilityRun(
  context: ProcessingContext
): CapabilityRun {
  let run = ungatedRuns.get(context);
  if (!run) {
    run = createCapabilityRun({
      context,
      gate: UNGATED,
      availableSecrets: contextSecretAvailability(context)
    });
    ungatedRuns.set(context, run);
  }
  return run;
}

/**
 * The availability callback for a run whose context can reach a secret store,
 * and `undefined` for one that cannot.
 *
 * Every host resolves the same way BaseNode's secret injection does — a key
 * with a non-empty value is available — so this is the one implementation
 * instead of one per host. It reads values, but only to test them: nothing
 * leaves the callback except the set of names that resolved.
 */
export function contextSecretAvailability(
  context: ProcessingContext
): AvailableSecretsResolver | undefined {
  if (!context.hasSecretResolver) return undefined;
  return async (keys) => {
    const found = new Set<string>();
    for (const key of keys) {
      if (await context.getSecret(key)) found.add(key);
    }
    return found;
  };
}

export interface CreateCapabilityRunOptions {
  context: ProcessingContext;
  /** Invocation-local cancellation without copying the processing context. */
  signal?: AbortSignal;
  gate: CapabilityGate;
  client?: ClientToolRouter;
  /** The project this run works in; see {@link CapabilityRun.projectId}. */
  projectId?: string;
  /** Opens the bespoke secret dialog; see {@link CapabilityRun.secretPrompt}. */
  secretPrompt?: SecretPrompt;
  subAgent?: SubAgentRuntime;
  /** The run's budget; see {@link CapabilityRun.budget}. */
  budget?: RunBudget;
  /**
   * Which declared credentials this install holds; see
   * {@link CapabilityRun.availableSecrets}. Build it with
   * {@link contextSecretAvailability} — a host that omits it turns off
   * `validate_workflow`'s `missing_secret` check rather than reporting every
   * declared key as absent.
   */
  availableSecrets?: AvailableSecretsResolver;
  nodeRegistry?: NodeRegistry;
  providers?: Record<string, BaseProvider>;
  examples?: ExampleWorkflowCatalog;
  exportDsl?: WorkflowDslExporter;
  modelCatalogs?: ModelCatalogs;
  listPackageAssets?: PackageAssetLister;
  /** See {@link CapabilityRun.deleteProject}. */
  deleteProject?: ProjectDeleter;
  /** The collection the `vector_*` capabilities act on; see {@link CapabilityRun}. */
  vectorCollection?: VectorCollection;
  workflowEnvironment?: WorkflowEnvironmentProvider;
  loaders?: CapabilityLoaders;
  /**
   * Capabilities this run serves beyond the registry — the subsystem-dependent
   * ones a host constructs itself today (`run_node`, `run_subtask`, the vector
   * tools), and the fakes a test registers. Checked before the registry, so a
   * host can also override one.
   */
  capabilities?: Iterable<CapabilityExport>;
}

/** Build a run whose `invoke` runs the gate before every implementation. */
export function createCapabilityRun(
  options: CreateCapabilityRunOptions
): CapabilityRun {
  const local = new Map<string, CapabilityExport>();
  for (const entry of options.capabilities ?? []) {
    local.set(entry.spec.name, entry);
  }

  const run: CapabilityRun = {
    context: options.context,
    signal: options.signal,
    gate: options.gate,
    client: options.client,
    projectId: options.projectId ?? options.context.projectId ?? undefined,
    secretPrompt: options.secretPrompt,
    subAgent: options.subAgent,
    budget: options.budget ?? budgetFromContext(options.context),
    availableSecrets: options.availableSecrets,
    nodeRegistry: options.nodeRegistry,
    providers: options.providers,
    examples: options.examples,
    exportDsl: options.exportDsl,
    modelCatalogs: options.modelCatalogs,
    listPackageAssets: options.listPackageAssets,
    deleteProject: options.deleteProject,
    vectorCollection: options.vectorCollection,
    workflowEnvironment: options.workflowEnvironment,
    loaders: options.loaders,
    invoke: async (name, args) => {
      const entry =
        local.get(name) ??
        (capabilitySpec(name) ? capabilityForName(name) : undefined);
      if (entry === undefined) {
        throw new Error(`no capability is registered for "${name}"`);
      }
      return invokeCapability(run, entry, args ?? {});
    }
  };

  return run;
}

/**
 * A host round trip the guest's budget must not pay for. An approval prompt is
 * the user's wait, and a monitor consult is another model's; charged to the
 * action's wall clock either one kills the very program that asked, and the
 * answer then resolves nothing. Without a clock this is a plain call.
 */
async function offTheClock<T>(
  gate: CapabilityGate,
  work: () => Promise<T>
): Promise<T> {
  const resume = gate.clock?.suspend();
  try {
    return await work();
  } finally {
    resume?.();
  }
}

/**
 * The one decide/ask/block ladder: the read-class fast path first (a read is
 * never prompted and never consulted by the monitor, even when one is wired
 * in), then the mode decision, then the session allow-set, then the approval
 * round trip.
 */
export async function invokeCapability(
  run: CapabilityRun,
  entry: CapabilityExport,
  rawArgs: Record<string, unknown>
): Promise<unknown> {
  (run.signal ?? run.context.signal)?.throwIfAborted();
  const { spec, impl } = entry;
  const checked = validateCapabilityArgs(spec, withSnakeCaseAliases(rawArgs));
  if (!checked.ok) return checked.error;
  const args = checked.args;
  const category = spec.category;
  const decision = decidePermission(run.gate.mode, category);

  // Read-class capabilities go straight to the implementation, so the "never
  // consulted by the monitor" invariant holds by construction.
  if (category === "read") {
    return impl(run, args);
  }

  if (decision === "allow") {
    return runImpl(run, entry, args, category);
  }

  if (decision === "block") {
    return {
      error: "blocked_in_plan_mode",
      message:
        `Cannot run \`${spec.name}\` in plan mode — only read-only ` +
        `tools are allowed. Produce a concrete plan instead and let the ` +
        `user switch out of plan mode to execute it.`
    };
  }

  // decision === "ask"
  if (run.gate.sessionAllow.has(spec.name)) {
    return runImpl(run, entry, args, category);
  }

  const answer = await offTheClock(run.gate, () =>
    run.gate.requestApproval({
      toolName: spec.name,
      category,
      args: Tool.stripMessage(args),
      message: resolveCapabilityMessage(spec, {
        ...args,
        _message: rawArgs["_message"]
      })
    })
  );

  if (answer === "deny") {
    return {
      error: "permission_denied",
      message:
        `The user declined to run \`${spec.name}\`. Do not retry the ` +
        `same call; explain what you wanted to do or propose an alternative.`
    };
  }

  if (answer === "allow_for_chat") {
    run.gate.sessionAllow.add(spec.name);
  }

  return runImpl(run, entry, args, category);
}

/**
 * The execution chokepoint for actionable (non-read) calls: the security
 * monitor is consulted here, after the mode/approval logic already said "run",
 * and a `block` verdict stops execution with a structured error mirroring the
 * block/deny paths above.
 */
async function runImpl(
  run: CapabilityRun,
  entry: CapabilityExport,
  args: Record<string, unknown>,
  category: PermissionCategory
): Promise<unknown> {
  const consult = run.gate.securityMonitor;
  if (consult) {
    const verdict = await offTheClock(run.gate, () =>
      consult({
        name: entry.spec.name,
        category,
        args: Tool.stripMessage(args),
        transcript: run.gate.recentTranscript?.()
      })
    );
    if (verdict.block) {
      const reason = verdict.reason?.trim()
        ? verdict.reason.trim()
        : "the security monitor flagged this action as unsafe";
      const remediation =
        verdict.tier === "hard"
          ? "This is a HARD block: it crosses a security boundary and cannot " +
            "be cleared by user instruction. Do not retry; choose a safe " +
            "alternative."
          : "This is a SOFT block: it was flagged as destructive or " +
            "high-reach. Do not retry the same call; if the user has " +
            "explicitly and specifically authorized this exact action, " +
            "surface that, otherwise propose a safer alternative.";
      return {
        error: "blocked_by_security_monitor",
        message:
          `The security monitor blocked \`${entry.spec.name}\` ` +
          `(tier: ${verdict.tier}, severity: ${verdict.severity}): ` +
          `${reason}. ${remediation}`
      };
    }
  }
  (run.signal ?? run.context.signal)?.throwIfAborted();
  return entry.impl(run, args);
}

/**
 * The user-facing message for an approval prompt: the LLM-authored `_message`
 * wins, else the spec's template, else the generic fallback — the same order
 * `Tool.resolveMessage` applies.
 */
export function resolveCapabilityMessage(
  spec: CapabilitySpec,
  args: Record<string, unknown> | null | undefined
): string {
  const llm = Tool.extractMessage(args ?? {});
  if (llm) return llm;
  const template = spec.userMessage?.(Tool.stripMessage(args ?? {}));
  return template && template.trim() ? template : `Running ${spec.name}`;
}

/** Provider declarations need metadata, not a legacy Tool instance. */
export function capabilityProviderTool(spec: CapabilitySpec): ProviderTool {
  return {
    name: spec.name,
    description: spec.description,
    inputSchema: injectUserMessageField(spec.inputSchema)
  };
}

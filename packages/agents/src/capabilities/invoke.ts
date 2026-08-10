/**
 * `CapabilityRun.invoke` — the single choke point: lookup → gate → impl.
 *
 * Today the gate is a wrapper class applied where someone remembered
 * `gateTools`. With no `Tool.process` left to wrap it moves here, into the one
 * place lookup already happens, so a direct call and an in-sandbox call cannot
 * take different paths.
 *
 * This is new machinery running beside `GatedTool`, not a replacement for it —
 * the gate move itself lands in PR 10. What guarantees the two agree meanwhile
 * is `tests/capabilities-gate-parity.test.ts`, which drives the same calls
 * through both and compares transcripts.
 *
 * Design: docs/tool-class-retirement-design.md § "Where the permission gate
 * lives".
 */

import type { BaseProvider, ProcessingContext } from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { VectorCollection } from "@nodetool-ai/vectorstore";
import { Tool } from "../tools/base-tool.js";
import {
  decidePermission,
  type PermissionCategory
} from "../tools/tool-permissions.js";
import { findCapability } from "./registry.js";
import type { LongTermMemory } from "../long-term-memory.js";
import type {
  CapabilityExport,
  CapabilityGate,
  CapabilityLoaders,
  CapabilityRun,
  CapabilitySpec,
  ClientToolRouter,
  SubAgentRuntime
} from "./types.js";
import type {
  ExampleWorkflowCatalog,
  ModelCatalogs,
  PackageAssetLister,
  WorkflowDslExporter,
  WorkflowEnvironmentProvider
} from "../tools/mcp-tools.js";

/**
 * The gate a directly-constructed tool carries. The deprecated `Tool`
 * subclasses are gated from the outside — `gateTools` wraps them per turn,
 * exactly as before — and the adapter calls the implementation without
 * consulting the run's own gate, so this exists only to satisfy the run's
 * shape. `auto` keeps the two paths equivalent if anything ever reaches
 * {@link CapabilityRun.invoke} through one of them.
 */
export const UNGATED: CapabilityGate = {
  mode: "auto",
  sessionAllow: new Set<string>(),
  requestApproval: async () => "allow"
};

export interface CreateCapabilityRunOptions {
  context: ProcessingContext;
  gate: CapabilityGate;
  client?: ClientToolRouter;
  subAgent?: SubAgentRuntime;
  nodeRegistry?: NodeRegistry;
  providers?: Record<string, BaseProvider>;
  examples?: ExampleWorkflowCatalog;
  exportDsl?: WorkflowDslExporter;
  modelCatalogs?: ModelCatalogs;
  listPackageAssets?: PackageAssetLister;
  /** The collection the `vector_*` capabilities act on; see {@link CapabilityRun}. */
  vectorCollection?: VectorCollection;
  workflowEnvironment?: WorkflowEnvironmentProvider;
  memory?: LongTermMemory;
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
    gate: options.gate,
    client: options.client,
    subAgent: options.subAgent,
    nodeRegistry: options.nodeRegistry,
    providers: options.providers,
    examples: options.examples,
    exportDsl: options.exportDsl,
    modelCatalogs: options.modelCatalogs,
    listPackageAssets: options.listPackageAssets,
    vectorCollection: options.vectorCollection,
    workflowEnvironment: options.workflowEnvironment,
    memory: options.memory,
    loaders: options.loaders,
    invoke: async (name, args) => {
      const entry = local.get(name) ?? (await findCapability(name));
      if (entry === undefined) {
        throw new Error(`no capability is registered for "${name}"`);
      }
      return gatedCall(run, entry, args ?? {});
    }
  };

  return run;
}

/**
 * The decide/ask/block ladder, verbatim from `GatedTool.process`: the
 * read-class fast path first (a read is never prompted and never consulted by
 * the monitor, even when one is wired in), then the mode decision, then the
 * session allow-set, then the approval round trip.
 */
async function gatedCall(
  run: CapabilityRun,
  entry: CapabilityExport,
  args: Record<string, unknown>
): Promise<unknown> {
  const { spec, impl } = entry;
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

  const answer = await run.gate.requestApproval({
    toolName: spec.name,
    category,
    args: Tool.stripMessage(args),
    message: resolveCapabilityMessage(spec, args)
  });

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
 * and a `block` verdict stops execution with the same structured error the
 * gate wrapper returns.
 */
async function runImpl(
  run: CapabilityRun,
  entry: CapabilityExport,
  args: Record<string, unknown>,
  category: PermissionCategory
): Promise<unknown> {
  const consult = run.gate.securityMonitor;
  if (consult) {
    const verdict = await consult({
      name: entry.spec.name,
      category,
      args: Tool.stripMessage(args),
      transcript: run.gate.recentTranscript?.()
    });
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

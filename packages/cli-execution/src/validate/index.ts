import { findMissingPacks } from "@nodetool-ai/execution/missing-packs";
/**
 * Wires the node-sdk {@link validateGraph} to the real node registry and the
 * shared target resolver (DB id / JSON file / DSL file). Integration code —
 * the registry pulls in every node pack — while the validation logic itself is
 * unit-tested in node-sdk's graph-validation.test.ts.
 */
import {
  collectSecretRequirementSites,
  validateGraph,
  type GraphValidationIssue,
  type GraphValidationRegistry,
  type GraphValidationReport,
  type NodeRegistry
} from "@nodetool-ai/node-sdk";
import {
  listRegisteredProviderIds,
  listOfflineModelIds,
  listOfflineRequiredTextInputs
} from "@nodetool-ai/runtime";
import { resolveTarget } from "../debug/target.js";
import type { DebugGraph, DebugTargetInfo } from "../debug/types.js";

interface ValidateResult {
  target: DebugTargetInfo;
  report: GraphValidationReport;
}

type ValidationRegistry = GraphValidationRegistry & Partial<Pick<NodeRegistry, "list" | "getNodePackageId">>;

interface ValidateDeps {
  loadFromDb: (id: string) => Promise<{ graph: DebugGraph } | null>;
  /** Registry view supplied by tests or an embedding host. */
  registry?: ValidationRegistry;
  /**
   * Answers which exact `keys` this install can resolve from its secret store.
   * Omit where no store exists — file/DSL targets skip the missing-secret
   * check entirely rather than guess.
   */
  availableSecrets?: (
    keys: readonly string[]
  ) => Promise<ReadonlySet<string>> | ReadonlySet<string>;
}

// Registering every node pack takes seconds and the result never changes
// within a process. A one-shot `nodetool validate` pays it once either way;
// a batch caller (scripts/validate-examples.mjs) validates hundreds of graphs
// in one process and must not pay it per graph.
let cachedRegistry: Promise<NodeRegistry> | null = null;

async function sharedRegistry(): Promise<NodeRegistry> {
  if (!cachedRegistry) {
    const attempt = import("../node-registry.js").then(({ buildFullRegistry }) => buildFullRegistry());
    cachedRegistry = attempt;
    attempt.catch(() => {
      if (cachedRegistry === attempt) { cachedRegistry = null; }
    });
  }
  return cachedRegistry;
}

/**
 * Nodes with outputs that no edge reads. The run drops their result and
 * still reports success, so name them. Info only: saved graphs keep preview
 * nodes that nothing reads.
 */
export function unreadOutputIssues(
  graph: { nodes?: unknown; edges?: unknown },
  registry: { getMetadata?: (type: string) => { outputs: readonly unknown[] } | undefined }
): GraphValidationIssue[] {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  if (edges.length === 0) return [];
  const read = new Set(edges.map((edge: { source?: unknown }) => String(edge?.source ?? "")));
  const issues: GraphValidationIssue[] = [];
  for (const node of nodes as { id?: unknown; type?: unknown }[]) {
    const id = String(node?.id ?? "");
    const type = String(node?.type ?? "");
    if (!id || !type || read.has(id)) continue;
    let meta: { outputs: readonly unknown[] } | undefined;
    try {
      meta = registry.getMetadata?.(type);
    } catch {
      // A registry view that cannot describe the type leaves it unchecked.
      continue;
    }
    if (!meta || meta.outputs.length === 0) continue;
    issues.push({
      severity: "info",
      code: "unread_output",
      nodeId: id,
      nodeType: type,
      message: `Nothing reads the output of node "${id}", so its result is dropped. Connect it to an Output node or to the next step.`
    });
  }
  return issues;
}

export async function runValidate(
  ref: string,
  deps: ValidateDeps
): Promise<ValidateResult> {
  const resolved = await resolveTarget(ref, deps.loadFromDb);
  let registryView = deps.registry;
  if (!registryView) {
    const registry = await sharedRegistry();
    registryView = {
      has: (t) => registry.has(t),
      availability: (t) => registry.availability(t),
      catalogEntry: (t) => registry.catalogEntry(t),
      catalogPack: (t) => registry.catalogPack(t),
      list: () => registry.list?.() ?? [],
      getNodePackageId: (t) => registry.getNodePackageId?.(t),
      getMetadata: (t) => registry.getMetadata(t),
      validateNode: (d, h) => registry.validateNode(d, h),
      listProviderIds: () => listRegisteredProviderIds(),
      // Manifest-backed providers and manifest-classified model types only;
      // everything else returns undefined and goes unchecked rather than
      // guessed at. ASR and language catalogs are not in any manifest.
      listModelIds: (provider: string, modelType: string) =>
        listOfflineModelIds(provider, modelType),
      listRequiredTextInputs: (
        provider: string,
        modelType: string,
        modelId: string
      ) => listOfflineRequiredTextInputs(provider, modelType, modelId)
    };
  }
  // Declared credentials are collected first so the host resolves exactly
  // those names — a store round trip per requirement, not per key in the DB.
  let availableSecrets: ReadonlySet<string> | undefined;
  if (resolved.info.source === "id" && deps.availableSecrets) {
    const sites = collectSecretRequirementSites(resolved.graph, registryView);
    availableSecrets = await deps.availableSecrets(
      sites.map((site) => site.key)
    );
  }
  const graphReport = validateGraph(resolved.graph, registryView, {
    availableSecrets
  });
  const unread = unreadOutputIssues(resolved.graph, registryView);
  const report = unread.length === 0 ? graphReport : {
    ...graphReport,
    issues: [...graphReport.issues, ...unread],
    counts: { ...graphReport.counts, info: graphReport.counts.info + unread.length }
  };
  if (registryView.availability && registryView.catalogEntry) {
    const missing = await findMissingPacks(resolved.graph, {
      availability: (type) => registryView.availability?.(type) ?? "unknown",
      catalogEntry: (type) => registryView.catalogEntry?.(type),
      list: () => registryView.list?.() ?? [],
      getNodePackageId: (type) => registryView.getNodePackageId?.(type)
    }, { loadWorkflow: deps.loadFromDb });
    if (missing) {
      const reported = new Set(report.issues.filter((issue) => issue.code === "pack_not_installed").map((issue) => issue.packId));
      const extra = missing.packs.filter((pack) => !reported.has(pack.id)).map((pack) => ({
        severity: "error" as const, code: "pack_not_installed", packId: pack.id,
        installBytes: pack.installBytes, installCommand: missing.install.command,
        message: `Node pack "${pack.id}" is required by the workflow and is not installed.`
      }));
      return { target: resolved.info, report: { ...report, ok: false, issues: [...report.issues, ...extra], counts: { ...report.counts, errors: report.counts.errors + extra.length } } };
    }
  }
  return { target: resolved.info, report };
}

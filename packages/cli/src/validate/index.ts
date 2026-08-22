/**
 * Wires the node-sdk {@link validateGraph} to the real node registry and the
 * shared target resolver (DB id / JSON file / DSL file). Integration code —
 * the registry pulls in every node pack — while the validation logic itself is
 * unit-tested in node-sdk's graph-validation.test.ts.
 */
import {
  collectSecretRequirementSites,
  validateGraph,
  type GraphValidationRegistry,
  type GraphValidationReport,
  type NodeRegistry
} from "@nodetool-ai/node-sdk";
import {
  listRegisteredProviderIds,
  listOfflineModelIds
} from "@nodetool-ai/runtime";
import { resolveTarget } from "../debug/target.js";
import type { DebugGraph, DebugTargetInfo } from "../debug/types.js";

interface ValidateResult {
  target: DebugTargetInfo;
  report: GraphValidationReport;
}

interface ValidateDeps {
  loadFromDb: (id: string) => Promise<{ graph: DebugGraph } | null>;
  /** Registry view supplied by tests or an embedding host. */
  registry?: GraphValidationRegistry;
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
let cachedRegistry: NodeRegistry | null = null;

async function sharedRegistry(): Promise<NodeRegistry> {
  if (!cachedRegistry) {
    const { buildFullRegistry } = await import("../node-registry.js");
    cachedRegistry = buildFullRegistry();
  }
  return cachedRegistry;
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
      getMetadata: (t) => registry.getMetadata(t),
      validateNode: (d, h) => registry.validateNode(d, h),
      listProviderIds: () => listRegisteredProviderIds(),
      // Manifest-backed providers and manifest-classified model types only;
      // everything else returns undefined and goes unchecked rather than
      // guessed at. ASR and language catalogs are not in any manifest.
      listModelIds: (provider: string, modelType: string) =>
        listOfflineModelIds(provider, modelType)
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
  const report = validateGraph(resolved.graph, registryView, {
    availableSecrets
  });
  return { target: resolved.info, report };
}

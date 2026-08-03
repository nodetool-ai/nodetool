/**
 * Wires the node-sdk {@link validateGraph} to the real node registry and the
 * shared target resolver (DB id / JSON file / DSL file). Integration code —
 * the registry pulls in every node pack — while the validation logic itself is
 * unit-tested in node-sdk's graph-validation.test.ts.
 */
import { validateGraph, type GraphValidationReport } from "@nodetool-ai/node-sdk";
import {
  listRegisteredProviderIds,
  listOfflineModelIds
} from "@nodetool-ai/runtime";
import { buildFullRegistry } from "../node-registry.js";
import { resolveTarget } from "../debug/index.js";
import type { DebugGraph, DebugTargetInfo } from "../debug/types.js";

export interface ValidateResult {
  target: DebugTargetInfo;
  report: GraphValidationReport;
}

export interface ValidateDeps {
  loadFromDb: (id: string) => Promise<{ graph: DebugGraph } | null>;
}

export async function runValidate(
  ref: string,
  deps: ValidateDeps
): Promise<ValidateResult> {
  const resolved = await resolveTarget(ref, deps.loadFromDb);
  const registry = buildFullRegistry();
  // Supplied here rather than on NodeRegistry itself: the registry also runs in
  // the browser, which has no provider registry to reach and should not pull
  // the runtime into its bundle for this.
  const report = validateGraph(resolved.graph, {
    has: (t) => registry.has(t),
    getMetadata: (t) => registry.getMetadata(t),
    validateNode: (d, h) => registry.validateNode(d, h),
    listProviderIds: () => listRegisteredProviderIds(),
    // Manifest-backed providers and manifest-classified model types only;
    // everything else returns undefined and goes unchecked rather than guessed
    // at. ASR and language catalogs are not in any manifest.
    listModelIds: (provider, modelType) =>
      listOfflineModelIds(provider, modelType)
  });
  return { target: resolved.info, report };
}

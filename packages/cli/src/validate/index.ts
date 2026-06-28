/**
 * Wires the node-sdk {@link validateGraph} to the real node registry and the
 * shared target resolver (DB id / JSON file / DSL file). Integration code —
 * the registry pulls in every node pack — while the validation logic itself is
 * unit-tested in node-sdk's graph-validation.test.ts.
 */
import { validateGraph, type GraphValidationReport } from "@nodetool-ai/node-sdk";
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
  const report = validateGraph(resolved.graph, registry);
  return { target: resolved.info, report };
}

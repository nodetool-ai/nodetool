/**
 * The registry adapter an authored graph is validated through.
 *
 * It lived in `finish-graph-tool.ts` until that tool — the last of the
 * incremental `add_node`/`add_edge` family — was deleted, and these two
 * helpers were the file's only live exports. `validate_workflow` and the
 * graph validator read them now.
 */

import {
  listOfflineModelIds,
  listOfflineRequiredTextInputs,
  listRegisteredProviderIds
} from "@nodetool-ai/runtime";
import {
  type GraphValidationRegistry,
  type NodeMetadata
} from "@nodetool-ai/node-sdk";

/**
 * Wrap the planner's registry for `validateGraph`.
 *
 * Two planner-specific relaxations:
 *
 * - Metadata-only (Python) node types count as known rather than unknown,
 *   mirroring the check `add_node` applies at add time.
 * - Unselected models are not errors. The planner is told to omit `model` so
 *   the run's configured provider+model gets stamped in at execution time; an
 *   empty model is the intended output, not a defect. Left in, this check
 *   would reject the shape the planner is asked to produce and push it into
 *   pinning a model it has no basis to choose.
 *
 * A model the planner *does* pin is checked, though: `NodeRegistry` carries no
 * provider catalog (it also runs in the browser), so without the two hooks
 * below `validateGraph` skipped provider and model ids entirely and a
 * hallucinated `fal-ai/flux/schnel` reached the graph the planner handed back.
 * The planner runs server-side, so the runtime's own registry is the default;
 * a caller with its own catalog overrides it.
 */
export function metadataAwareRegistry(
  registry: GraphValidationRegistry
): GraphValidationRegistry {
  return {
    has: (nodeType: string) =>
      registry.has(nodeType) || registry.getMetadata(nodeType) != null,
    getMetadata: (nodeType: string): NodeMetadata | undefined =>
      registry.getMetadata(nodeType),
    validateNode: (descriptor, connectedHandles) =>
      registry
        .validateNode(descriptor, connectedHandles)
        .filter((issue) => issue.code !== "unset_model"),
    listProviderIds: () =>
      registry.listProviderIds?.() ?? listRegisteredProviderIds(),
    listModelIds: (provider, modelType) =>
      registry.listModelIds
        ? registry.listModelIds(provider, modelType)
        : listOfflineModelIds(provider, modelType),
    listRequiredTextInputs: (provider, modelType, modelId) =>
      registry.listRequiredTextInputs
        ? registry.listRequiredTextInputs(provider, modelType, modelId)
        : listOfflineRequiredTextInputs(provider, modelType, modelId)
  };
}

/** True when the registry implements the full validation surface (stubs and mocks often don't). */
export function supportsDeepValidation(
  registry: unknown
): registry is GraphValidationRegistry {
  const r = registry as Partial<GraphValidationRegistry> | null | undefined;
  return (
    !!r &&
    typeof r.has === "function" &&
    typeof r.getMetadata === "function" &&
    typeof r.validateNode === "function"
  );
}

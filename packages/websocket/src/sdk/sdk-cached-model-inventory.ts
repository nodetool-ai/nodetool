import type { PythonBridge, UnifiedModelLike } from "@nodetool-ai/runtime";
import { isNonBlankString } from "../lib/wire-values.js";

interface SdkV1CachedModelInventorySource {
  providerIds: readonly string[];
  listModels: (
    userId: string
  ) => Promise<readonly UnifiedModelLike[]> | readonly UnifiedModelLike[];
}

interface CreateNodeToolSdkV1CachedModelInventoryOptions {
  sources?: readonly SdkV1CachedModelInventorySource[];
  pythonBridge?: Pick<PythonBridge, "listCachedModels">;
  getPythonBridgeReady?: () => boolean;
  pythonProviderIds?: readonly string[];
}

function modelIds(models: readonly UnifiedModelLike[]): string[] {
  const ids = new Set<string>();
  for (const model of models) {
    if (model.downloaded === false) continue;
    if (isNonBlankString(model.id)) {
      ids.add(model.id.trim());
    }
    if (isNonBlankString(model.repo_id)) {
      ids.add(model.repo_id.trim());
    }
  }
  return [...ids].sort();
}

/**
 * Composes local/cached model sources into the preflight inventory contract.
 *
 * Sources are explicitly associated with provider IDs. Unsupported providers,
 * unavailable bridges, and failed cache reads reject conservatively so the
 * caller reports `unknown` rather than falsely claiming a model is absent.
 */
export function createNodeToolSdkV1CachedModelInventory(
  options: CreateNodeToolSdkV1CachedModelInventoryOptions
) {
  const sources = [...(options.sources ?? [])];
  if (options.pythonBridge) {
    const pythonBridge = options.pythonBridge;
    sources.push({
      providerIds: options.pythonProviderIds ?? ["huggingface"],
      async listModels() {
        if (options.getPythonBridgeReady && !options.getPythonBridgeReady()) {
          throw new Error("Cached model inventory is unavailable.");
        }
        return pythonBridge.listCachedModels();
      }
    });
  }

  return async (
    userId: string,
    providerId: string,
    _modelTypes: readonly string[]
  ): Promise<readonly string[]> => {
    const matching = sources.filter((source) =>
      source.providerIds.includes(providerId)
    );
    if (matching.length === 0) {
      throw new Error("Cached model inventory is unavailable.");
    }

    try {
      const models = await Promise.all(
        matching.map((source) => source.listModels(userId))
      );
      return modelIds(models.flat());
    } catch {
      throw new Error("Cached model inventory is unavailable.");
    }
  };
}

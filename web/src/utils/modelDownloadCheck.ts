import { UnifiedModel } from "../stores/ApiTypes";

/**
 * Checks if a model is downloaded based on different criteria:
 * 1. No path, no patterns - check if repo exists in downloaded models
 * 2. Path set - check for basename of path in cached files
 * 3. Patterns set - handle like case 1 (may be wrong in some cases)
 */
export function isModelDownloaded(
  model:
    | UnifiedModel
    | { repo_id?: string; path?: string; allow_patterns?: string[] },
  downloadedModelIds: Set<string>
): boolean {
  const modelId = "id" in model ? model.id : model.repo_id;

  // Case 1: No path, no patterns - just check if repo exists
  if (!model.path && !model.allow_patterns) {
    return !!(
      (modelId && downloadedModelIds.has(modelId)) ||
      (model.repo_id && downloadedModelIds.has(model.repo_id))
    );
  }

  // Case 2: Path set - check for basename of path in cached files
  if (model.path && model.repo_id) {
    return false;
  }

  // Case 3: Patterns set - handle like case 1 (may be wrong in some cases)
  if (model.allow_patterns) {
    return !!(
      (modelId && downloadedModelIds.has(modelId)) ||
      (model.repo_id && downloadedModelIds.has(model.repo_id))
    );
  }

  return false;
}

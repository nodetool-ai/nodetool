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
  downloadedModelIds: Set<string>,
  hfModels?: UnifiedModel[]
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
    const _cachedModel = hfModels?.find((hf) => hf.id === model.repo_id);
    // if (cachedModel && (cachedModel as any).cached_files) {
    //   const cachedFiles = (cachedModel as any).cached_files as CachedFileInfo[];
    //   const pathBasename = model.path.split("/").pop() || model.path;
    //   return cachedFiles.some((file) => {
    //     const fileBasename = file.file_name.split("/").pop() || file.file_name;
    //     return fileBasename === pathBasename;
    //   });
    // }
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

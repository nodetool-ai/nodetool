import type { HfCacheStatusRequestItem } from "../serverState/checkHfCacheStatus";
import type { UnifiedModel } from "../stores/ApiTypes";

export const isHfModel = (model: UnifiedModel): boolean => {
  const type = model.type ?? "";
  return (
    type.startsWith("hf.") ||
    type.startsWith("hf_") ||
    model.path != null ||
    model.allow_patterns != null ||
    model.ignore_patterns != null
  );
};

export const canCheckHfCache = (model: UnifiedModel): boolean => {
  return isHfModel(model) && Boolean(model.repo_id || model.id);
};

export const getHfCacheKey = (model: UnifiedModel): string => {
  const repoId = model.repo_id || model.id;
  return model.path ? `${repoId}/${model.path}` : repoId;
};

export const buildHfCacheRequest = (
  model: UnifiedModel
): HfCacheStatusRequestItem | null => {
  if (!canCheckHfCache(model)) {
    return null;
  }
  return {
    key: getHfCacheKey(model),
    repo_id: model.repo_id || model.id,
    model_type: model.type ?? null,
    path: model.path ?? null,
    allow_patterns: model.path ? null : model.allow_patterns ?? null,
    ignore_patterns: model.path ? null : model.ignore_patterns ?? null
  };
};

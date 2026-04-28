// @nodetool-ai/huggingface — HuggingFace integration package
// Cache scanning, model discovery, artifact inspection, and downloads

export { getHfToken, resolveHfToken, clearHfTokenCache } from "./hf-auth.js";

export { HfFastCache, getDefaultHfCacheDir } from "./hf-cache.js";

export type { UnifiedModel } from "./hf-models.js";
export {
  RepoPackagingHint,
  SUPPORTED_MODEL_TYPES,
  GENERIC_HF_TYPES,
  HF_SEARCH_TYPE_CONFIG,
  readCachedHfModels,
  searchCachedHfModels,
  getModelsByHfType,
  deleteCachedHfModel,
  getLlamaCppModelsFromCache,
  detectRepoPackaging
} from "./hf-models.js";

export type {
  HfHubModel,
  SearchHfHubOptions,
  ListAllHfModelsOptions
} from "./hf-hub-search.js";
export { searchHfHub, listAllHfModels } from "./hf-hub-search.js";

export type { DetectionResult } from "./safetensors-inspector.js";
export { detectModel } from "./safetensors-inspector.js";

export type { SafetensorSummary } from "./safetensor-layout.js";
export {
  SafetensorLayoutHint,
  summarizeSafetensor,
  classifySafetensorSet
} from "./safetensor-layout.js";

export type { ArtifactDetection } from "./artifact-inspector.js";
export { inspectPaths } from "./artifact-inspector.js";

export type { HFFileInfo, HFFileRequest } from "./hf-file-info.js";
export { getHuggingfaceFileInfos } from "./hf-file-info.js";

export {
  asyncHfDownload,
  hfHubFileUrl,
  hfCacheRoot,
  hfRepoCacheDir
} from "./hf-downloader.js";

export type {
  DownloadUpdate,
  ProgressCallback
} from "./hf-download-manager.js";
export { DownloadManager, getDownloadManager } from "./hf-download-manager.js";

export {
  getLlamaCppCacheDir,
  getLlamaCppModelFilename,
  getLlamaCppModelPath,
  isLlamaCppModelCached,
  downloadLlamaCppModel
} from "./llama-cpp-download.js";

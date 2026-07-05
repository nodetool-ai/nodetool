# @nodetool-ai/huggingface

HuggingFace integration for [NodeTool](https://nodetool.ai) — cache scanning, model discovery, artifact inspection, and downloads.

Scan the local HuggingFace cache, search the Hub, inspect safetensors layouts to classify model types, and download repos or GGUF files for llama.cpp with progress reporting.

## Install

```bash
npm install @nodetool-ai/huggingface
```

## Exported symbols

| Symbol | Kind | Description |
|---|---|---|
| `getHfToken`, `resolveHfToken`, `clearHfTokenCache` | function | Resolve the HuggingFace access token from the secret store / env |
| `HfFastCache`, `getDefaultHfCacheDir` | class / function | Fast scan of the local HF cache |
| `readCachedHfModels`, `searchCachedHfModels`, `getModelsByHfType`, `filterModelsByHfType`, `deleteCachedHfModel` | function | Query and prune cached models |
| `getLlamaCppModelsFromCache`, `detectRepoPackaging` | function | Detect GGUF / repo packaging |
| `searchHfHub`, `listAllHfModels` | function | Search and list models on the Hub |
| `detectModel`, `summarizeSafetensor`, `classifySafetensorSet` | function | Inspect safetensors and classify model type |
| `inspectPaths` | function | Detect model artifacts under given paths |
| `getHuggingfaceFileInfos` | function | Fetch file metadata for repo files |
| `asyncHfDownload`, `hfHubFileUrl`, `hfCacheRoot`, `hfRepoCacheDir` | function | Download repos and resolve cache paths |
| `DownloadManager`, `getDownloadManager` | class / function | Track and report download progress |
| `downloadLlamaCppModel`, `getLlamaCppModelPath`, `isLlamaCppModelCached` | function | Manage GGUF models for llama.cpp |
| `UnifiedModel`, `HfHubModel`, `DetectionResult`, `SafetensorSummary`, `DownloadUpdate` | type | Model and inspection value types |

## Usage

```ts
import {
  readCachedHfModels,
  searchHfHub,
  getDownloadManager
} from "@nodetool-ai/huggingface";

// List models already in the local cache
const cached = await readCachedHfModels();

// Search the Hub
const results = await searchHfHub({ query: "flux", limit: 10 });

// Download with progress
const manager = getDownloadManager();
await manager.startDownload("black-forest-labs/FLUX.1-schnell", {
  onProgress: (update) => console.log(`${update.repoId}: ${update.status}`)
});
```

Cache paths follow the standard `HF_HOME` / `~/.cache/huggingface` layout. Authenticated calls use the token resolved by `resolveHfToken` (secret store, then `HF_TOKEN`).

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)

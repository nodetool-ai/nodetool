import { createHash } from "node:crypto";
import { RECOMMENDED_MODELS } from "@nodetool-ai/runtime";
import type { UnifiedModel } from "@nodetool-ai/protocol";
import {
  sdkV1ModelCatalog,
  type SdkV1ModelAvailability,
  type SdkV1ModelCatalog,
  type SdkV1ModelCatalogEntry,
  type SdkV1ModelCatalogQuery
} from "@nodetool-ai/protocol/api-schemas/sdk-models-v1.js";
import {
  collectProviderCatalogModels,
  getAllModels,
  getAvailableProviderIds
} from "../trpc/routers/models.js";
import { getExistingDownloadManager } from "@nodetool-ai/huggingface";

const LOCAL_PROVIDER_IDS = new Set([
  "huggingface",
  "llama_cpp",
  "node_llama_cpp",
  "ollama",
  "transformers_js"
]);

type CatalogProjectionOptions = {
  configuredProviderIds: ReadonlySet<string>;
  downloadingRepoIds?: ReadonlySet<string>;
  recommendedModels?: readonly UnifiedModel[];
};

function sourceId(model: UnifiedModel): string {
  return model.repo_id || model.id;
}

function modelKey(model: UnifiedModel): string {
  return [
    model.type || "unknown",
    model.provider || "",
    sourceId(model),
    model.path || ""
  ].join("|");
}

function recommendationKeys(models: readonly UnifiedModel[]): Set<string> {
  return new Set(models.map(modelKey));
}

function isRepositoryModel(type: string): boolean {
  return (
    type === "llama_model" ||
    type === "llama_cpp_model" ||
    type.startsWith("hf.") ||
    type.startsWith("tjs.")
  );
}

function buildWireValue(model: UnifiedModel, compatibility: string) {
  if (isRepositoryModel(compatibility)) {
    const value: Record<string, unknown> = {
      type: compatibility,
      repo_id: sourceId(model)
    };
    if (compatibility !== "llama_model") {
      value["path"] = model.path ?? null;
    }
    return value;
  }

  const value: Record<string, unknown> = {
    type: compatibility,
    id: model.id,
    name: model.name,
    provider: model.provider ?? ""
  };
  if (model.path) value["path"] = model.path;
  if (model.supported_tasks?.length) {
    value["supported_tasks"] = [...model.supported_tasks];
  }
  if (model.voices?.length) {
    value["voices"] = [...model.voices];
    value["selected_voice"] = model.voices[0] ?? "";
  }
  return value;
}

function availabilityFor(
  model: UnifiedModel,
  recommended: boolean,
  options: CatalogProjectionOptions
): SdkV1ModelAvailability {
  const repoId = sourceId(model);
  if (options.downloadingRepoIds?.has(repoId)) return "downloading";
  if (model.execution) {
    if (model.execution.state === "download_required") return "downloadable";
    if (model.execution.state === "unavailable") return "unavailable";
    return model.execution.kind === "api" ? "ready_remote" : "ready_local";
  }
  if (model.downloaded === true || Boolean(model.cache_path)) {
    return "ready_local";
  }
  if (
    model.provider &&
    options.configuredProviderIds.has(model.provider) &&
    !LOCAL_PROVIDER_IDS.has(model.provider)
  ) {
    return "ready_remote";
  }
  if (recommended && isRepositoryModel(model.type || "unknown")) {
    return "downloadable";
  }
  return "unavailable";
}

export function projectSdkModelCatalog(
  models: readonly UnifiedModel[],
  query: SdkV1ModelCatalogQuery,
  options: CatalogProjectionOptions
): SdkV1ModelCatalog {
  const recommended = recommendationKeys(
    options.recommendedModels ?? RECOMMENDED_MODELS
  );
  const entries = models
    .map((model): SdkV1ModelCatalogEntry => {
      const compatibility = model.type || "unknown";
      const isRecommended = recommended.has(modelKey(model));
      return {
        key: modelKey(model),
        display_name: model.name || sourceId(model),
        compatibility,
        availability: availabilityFor(model, isRecommended, options),
        recommended: isRecommended,
        scope: query.scope,
        provider: model.provider ?? null,
        id: model.id,
        repo_id: model.repo_id ?? null,
        path: model.path ?? null,
        supported_tasks: model.supported_tasks ?? [],
        size_on_disk: model.size_on_disk ?? null,
        wire_value: buildWireValue(model, compatibility)
      };
    })
    .filter(
      (entry) =>
        (!query.compatibility || entry.compatibility === query.compatibility) &&
        (!query.availability || entry.availability === query.availability) &&
        (!query.provider || entry.provider === query.provider)
    )
    .sort((left, right) => left.key.localeCompare(right.key));

  const revision = createHash("sha256")
    .update(JSON.stringify(entries))
    .digest("hex");
  const start = query.cursor
    ? Math.max(0, entries.findIndex((entry) => entry.key === query.cursor) + 1)
    : 0;
  const page = entries.slice(start, start + query.limit);
  const nextCursor =
    start + page.length < entries.length ? (page.at(-1)?.key ?? null) : null;

  return sdkV1ModelCatalog.parse({
    version: "1",
    catalog_revision: revision,
    scope: query.scope,
    entries: page,
    next_cursor: nextCursor
  });
}

// The per-provider model enumeration fans out to remote provider APIs and is
// the slow part of a catalog request. Its result is pure remote data (no
// local download state), so a short TTL cache is safe and keeps repeated SDK
// catalog polls fast.
const PROVIDER_CATALOG_TTL_MS = 60_000;
const providerCatalogCache = new Map<
  string,
  { at: number; models: readonly UnifiedModel[] }
>();

function pruneProviderCatalogCache(now: number): void {
  for (const [key, value] of providerCatalogCache) {
    if (now - value.at >= PROVIDER_CATALOG_TTL_MS) {
      providerCatalogCache.delete(key);
    }
  }
}

async function getCachedProviderCatalogModels(
  userId: string
): Promise<readonly UnifiedModel[]> {
  const now = Date.now();
  pruneProviderCatalogCache(now);

  const cached = providerCatalogCache.get(userId);
  if (cached && now - cached.at < PROVIDER_CATALOG_TTL_MS) {
    return cached.models;
  }
  const models = await collectProviderCatalogModels(userId);
  providerCatalogCache.set(userId, { at: now, models });
  return models;
}

export function clearProviderCatalogCache(): void {
  providerCatalogCache.clear();
}

function dedupeCatalogModels(models: readonly UnifiedModel[]): UnifiedModel[] {
  const byKey = new Map<string, UnifiedModel>();
  for (const model of models) {
    const key = modelKey(model);
    const existing = byKey.get(key);
    if (!existing || model.downloaded === true) byKey.set(key, model);
  }
  return [...byKey.values()];
}

export async function getSdkV1ModelCatalog(args: {
  userId: string;
  query: SdkV1ModelCatalogQuery;
  recommendedModels?: readonly UnifiedModel[];
  getWorkerModels?: () => Promise<readonly UnifiedModel[]>;
  getProviderCatalogModels?: (
    userId: string
  ) => Promise<readonly UnifiedModel[]>;
}): Promise<SdkV1ModelCatalog> {
  let availableModels: readonly UnifiedModel[];
  let providerCatalogModels: readonly UnifiedModel[];
  let providerIds: readonly string[];
  if (args.query.scope === "worker") {
    if (!args.getWorkerModels) {
      throw new SdkModelCatalogServiceError(
        "Worker model catalogs are not available through this server."
      );
    }
    availableModels = await args.getWorkerModels();
    providerCatalogModels = [];
    providerIds = [];
  } else {
    [availableModels, providerCatalogModels, providerIds] = await Promise.all([
      getAllModels(args.userId),
      (args.getProviderCatalogModels ?? getCachedProviderCatalogModels)(
        args.userId
      ),
      getAvailableProviderIds(args.userId)
    ]);
  }
  const recommendedModels = [
    ...RECOMMENDED_MODELS,
    ...(args.recommendedModels ?? [])
  ];
  const models = dedupeCatalogModels([
    ...availableModels,
    ...providerCatalogModels,
    ...recommendedModels
  ]);
  const manager =
    args.query.scope === "local"
      ? getExistingDownloadManager(args.userId)
      : null;
  const downloadingRepoIds = new Set<string>();
  if (manager) {
    for (const model of models) {
      const repoId = sourceId(model);
      const state = manager.getRepositoryDownloadState(repoId);
      if (
        state &&
        (state.status === "idle" ||
          state.status === "start" ||
          state.status === "progress")
      ) {
        downloadingRepoIds.add(repoId);
      }
    }
  }

  return projectSdkModelCatalog(models, args.query, {
    configuredProviderIds: new Set(providerIds),
    downloadingRepoIds,
    recommendedModels
  });
}

export class SdkModelCatalogServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SdkModelCatalogServiceError";
  }
}

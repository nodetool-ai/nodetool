import type {
  ModelExecutionAvailability,
  UnifiedModel
} from "@nodetool-ai/protocol";

export interface ProviderExecutionInfo {
  access: "in_process" | "local_service" | "remote_api";
  displayName: string;
  configured: boolean;
}

function repositoryId(model: UnifiedModel): string | null {
  return model.repo_id || model.adapter?.artifact_ref?.repo_id || null;
}

function isRepositoryModel(model: UnifiedModel): boolean {
  const type = model.type ?? "";
  return (
    type === "llama_model" ||
    type === "llama_cpp_model" ||
    type.startsWith("hf.") ||
    type.startsWith("tjs.")
  );
}

function isTtsRepository(model: UnifiedModel): boolean {
  return (
    model.type === "hf.text_to_speech" ||
    model.pipeline_tag === "text-to-speech"
  );
}

function unavailable(reason: string): ModelExecutionAvailability {
  return {
    kind: "unavailable",
    state: "unavailable",
    label: "Unavailable",
    reason
  };
}

function resolveAdapterTarget(
  target: UnifiedModel,
  cachedRepoIds: ReadonlySet<string>,
  providers: ReadonlyMap<string, ProviderExecutionInfo>
): ModelExecutionAvailability {
  const adapter = target.adapter;
  if (!adapter) {
    return unavailable(
      "No local execution adapter is registered for this model."
    );
  }
  if (adapter.state === "missing_dependency") {
    return unavailable(
      adapter.reason ?? "The local execution adapter is not installed."
    );
  }
  if (adapter.state !== "installed") {
    return unavailable(
      adapter.reason ?? "The local execution adapter could not be verified."
    );
  }

  const repoId = adapter.artifact_ref?.repo_id;
  const provider = target.provider ? providers.get(target.provider) : undefined;
  const kind = provider?.access === "local_service" ? "server" : "local";
  const label = kind === "server" ? "Server" : "Local";
  if (repoId && cachedRepoIds.has(repoId.toLowerCase())) {
    return {
      kind,
      state: "ready",
      label,
      reason:
        kind === "server"
          ? `Runs through ${provider?.displayName ?? "a local server"}.`
          : "Runs on this device."
    };
  }
  return {
    kind,
    state: "download_required",
    label,
    reason: "Download the model files before using it locally."
  };
}

/**
 * Resolve execution truth without treating cached files as proof that a model
 * can run. Local adapter facts, provider origin, and cache state remain
 * independent inputs and are joined only by the adapter's exact repository ID.
 */
export function resolveModelExecutionAvailability(
  models: readonly UnifiedModel[],
  providers: ReadonlyMap<string, ProviderExecutionInfo>
): UnifiedModel[] {
  const cachedRepoIds = new Set<string>();
  const localTargetsByRepo = new Map<string, UnifiedModel>();

  for (const model of models) {
    const repoId = repositoryId(model);
    if (repoId && (model.downloaded === true || Boolean(model.cache_path))) {
      cachedRepoIds.add(repoId.toLowerCase());
    }
    const targetRepo = model.adapter?.artifact_ref?.repo_id;
    if (targetRepo) localTargetsByRepo.set(targetRepo.toLowerCase(), model);
  }

  return models.map((model) => {
    const provider = model.provider ? providers.get(model.provider) : undefined;
    const providerCatalogModel = !isRepositoryModel(model);

    if (providerCatalogModel && provider?.access === "remote_api") {
      return {
        ...model,
        execution: provider.configured
          ? {
              kind: "api",
              state: "ready",
              label: "API",
              reason: `Input is sent to ${provider.displayName}. Provider billing applies.`
            }
          : unavailable(
              `Configure ${provider.displayName} before using this model.`
            )
      };
    }

    const repoId = repositoryId(model);
    const target = repoId
      ? localTargetsByRepo.get(repoId.toLowerCase())
      : undefined;
    if (model.adapter || target) {
      return {
        ...model,
        execution: resolveAdapterTarget(
          model.adapter ? model : target!,
          cachedRepoIds,
          providers
        )
      };
    }

    if (providerCatalogModel && provider?.access === "local_service") {
      return {
        ...model,
        execution: {
          kind: "server",
          state: "ready",
          label: "Server",
          reason: `Available through ${provider.displayName}.`
        }
      };
    }

    if (providerCatalogModel && provider?.access === "in_process") {
      return {
        ...model,
        execution: {
          kind: "local",
          state: "ready",
          label: "Local",
          reason: "Runs on this device."
        }
      };
    }

    if (isTtsRepository(model)) {
      return {
        ...model,
        execution: unavailable(
          model.downloaded || model.cache_path
            ? "Model files are present, but no installed TTS adapter can run them."
            : "No installed TTS adapter can run this model."
        )
      };
    }

    if (model.downloaded === true || Boolean(model.cache_path)) {
      return {
        ...model,
        execution: {
          kind: "local",
          state: "ready",
          label: "Local",
          reason: "Runs on this device."
        }
      };
    }

    if (isRepositoryModel(model)) {
      return {
        ...model,
        execution: {
          kind: "local",
          state: "download_required",
          label: "Local",
          reason: "Download the model files before using it locally."
        }
      };
    }

    return {
      ...model,
      execution: unavailable("No available execution target was found.")
    };
  });
}

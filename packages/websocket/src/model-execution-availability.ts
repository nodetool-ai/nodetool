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

export function readyProviderExecution(
  provider: Pick<ProviderExecutionInfo, "access" | "displayName">
): ModelExecutionAvailability {
  if (provider.access === "remote_api") {
    return {
      kind: "api",
      state: "ready",
      label: "API",
      reason: `Input is sent to ${provider.displayName}. Provider billing applies.`,
      execution_site: "provider",
      runtime_name: provider.displayName
    };
  }
  return {
    kind: "server",
    state: "ready",
    label: "Server",
    reason:
      provider.access === "local_service"
        ? `Runs through ${provider.displayName} on the NodeTool host.`
        : "Runs on the NodeTool host.",
    execution_site: "nodetool_host",
    runtime_name:
      provider.access === "local_service" ? provider.displayName : null
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
  if (repoId && cachedRepoIds.has(repoId.toLowerCase())) {
    return {
      kind: "server",
      state: "ready",
      label: "Server",
      reason: provider
        ? `Runs through ${provider.displayName} on the NodeTool host.`
        : "Runs on the NodeTool host.",
      execution_site: "nodetool_host",
      runtime_name: provider?.displayName ?? null
    };
  }
  return {
    kind: "server",
    state: "download_required",
    label: "Server",
    reason: "Download the model files to the NodeTool host before use.",
    execution_site: "nodetool_host",
    runtime_name: provider?.displayName ?? null
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
          ? readyProviderExecution(provider)
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
        execution: readyProviderExecution(provider)
      };
    }

    if (providerCatalogModel && provider?.access === "in_process") {
      return {
        ...model,
        execution: readyProviderExecution(provider)
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
        execution: unavailable(
          "Model files are present, but no execution adapter or provider target was reported."
        )
      };
    }

    if (isRepositoryModel(model)) {
      return {
        ...model,
        execution: {
          kind: "server",
          state: "download_required",
          label: "Server",
          reason: "Download the model files to the NodeTool host before use.",
          execution_site: "nodetool_host"
        }
      };
    }

    return {
      ...model,
      execution: unavailable("No available execution target was found.")
    };
  });
}

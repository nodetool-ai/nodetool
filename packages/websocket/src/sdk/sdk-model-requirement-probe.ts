import { getSecret } from "@nodetool-ai/models";
import {
  isProviderConfigured,
  listRegisteredProviderIds
} from "@nodetool-ai/runtime";
import type { SdkV1Requirement } from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import type { SdkV1RequirementAvailability } from "./sdk-static-preflight-service.js";

type ModelRequirement = Readonly<SdkV1Requirement>;
type ModelType =
  | "language_model"
  | "image_model"
  | "video_model"
  | "tts_model"
  | "asr_model"
  | "embedding_model";

const SUPPORTED_MODEL_TYPES = new Set<ModelType>([
  "language_model",
  "image_model",
  "video_model",
  "tts_model",
  "asr_model",
  "embedding_model"
]);

interface CreateNodeToolSdkV1ModelProbeOptions {
  userId: string;
  timeoutMs?: number;
  listProviderIds?: () => readonly string[];
  isProviderReady?: (userId: string, providerId: string) => Promise<boolean>;
  /**
   * Reads a cache or local inventory maintained outside preflight. It must not
   * call a remote provider, download a model, or start inference.
   */
  listModelIds?: (
    userId: string,
    providerId: string,
    modelTypes: readonly ModelType[]
  ) => Promise<readonly string[]>;
  /**
   * Reads already-tracked download state. It must not begin, retry, or cancel
   * a download.
   */
  getModelDownloadStatus?: (
    userId: string,
    providerId: string,
    modelId: string
  ) =>
    | Promise<"downloading" | "not_downloading" | "unknown">
    | "downloading"
    | "not_downloading"
    | "unknown";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Model inventory probe timed out.")),
      timeoutMs
    );
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Checks a selected model only against its recorded provider and model type.
 *
 * The probe reads an injected cache/local model inventory with a bounded
 * timeout. It never searches unrelated providers, calls a remote model-list
 * endpoint, downloads a model, or starts inference.
 */
export function createNodeToolSdkV1ModelProbe(
  options: CreateNodeToolSdkV1ModelProbeOptions
): (requirement: ModelRequirement) => Promise<SdkV1RequirementAvailability> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const listProviderIds =
    options.listProviderIds ?? (() => listRegisteredProviderIds());
  const isProviderReady =
    options.isProviderReady ??
    ((userId: string, providerId: string) =>
      isProviderConfigured(providerId, (key) =>
        getSecret(key, userId).then((value) => value ?? undefined)
      ));
  const listModelIds = options.listModelIds;

  return async (requirement) => {
    const providerIds = [
      ...new Set(stringArray(requirement.details?.provider_ids))
    ].sort();
    const modelTypes = [
      ...new Set(
        stringArray(requirement.details?.model_types).filter(
          (value): value is ModelType =>
            SUPPORTED_MODEL_TYPES.has(value as ModelType)
        )
      )
    ].sort();
    if (providerIds.length === 0 || modelTypes.length === 0) {
      return {
        status: "unknown",
        message: "Model provider or model type is not specified."
      };
    }

    const registered = new Set(listProviderIds());
    const candidates = providerIds.filter((id) => registered.has(id));
    if (candidates.length === 0) {
      return {
        status: "unavailable",
        message: "No recorded model provider is registered."
      };
    }

    let configuredProviders = 0;
    let successfulInventories = 0;
    for (const providerId of candidates) {
      if (options.getModelDownloadStatus) {
        try {
          const downloadStatus = await withTimeout(
            Promise.resolve(
              options.getModelDownloadStatus(
                options.userId,
                providerId,
                requirement.id
              )
            ),
            timeoutMs
          );
          if (downloadStatus === "downloading") {
            return {
              status: "downloading",
              message: "Required model is downloading."
            };
          }
        } catch {
          // Download state is advisory; cache inventory remains authoritative.
        }
      }
      if (!(await isProviderReady(options.userId, providerId))) continue;
      configuredProviders++;
      if (!listModelIds) continue;
      try {
        const ids = await withTimeout(
          listModelIds(options.userId, providerId, modelTypes),
          timeoutMs
        );
        successfulInventories++;
        if (ids.includes(requirement.id)) {
          return { status: "available", message: null };
        }
      } catch {
        // A failed inventory cannot prove that the selected model is absent.
      }
    }

    if (configuredProviders === 0) {
      return {
        status: "unknown",
        message: "Model availability requires a configured provider."
      };
    }
    if (!listModelIds) {
      return {
        status: "unknown",
        message: "Model cache inventory has not been configured."
      };
    }
    if (successfulInventories < configuredProviders) {
      return {
        status: "unknown",
        message: "Model inventory could not be checked."
      };
    }
    return {
      status: "unavailable",
      message: "Selected model is not available from its recorded provider."
    };
  };
}

import type {
  LanguageModel,
  ImageModel,
  ASRModel,
  TTSModel,
  VideoModel,
  EmbeddingModel
} from "../stores/ApiTypes";
import type { TypeTag, SizeBucket } from "../stores/ModelFiltersStore";
import type { ModelExecutionAvailability } from "@nodetool-ai/protocol";
import { isLocalhost } from "../lib/env";

export type ModelSelectorModel = (
  | LanguageModel
  | EmbeddingModel
  | ImageModel
  | ASRModel
  | TTSModel
  | VideoModel
) & { execution?: ModelExecutionAvailability | null };

const UNKNOWN_MODEL_EXECUTION: ModelExecutionAvailability = {
  kind: "unavailable",
  state: "unavailable",
  label: "Unavailable",
  reason: "Execution availability was not reported by this server."
};

export function executionForDisplay(
  model: Pick<ModelSelectorModel, "execution">,
  nodetoolHostIsLocal: boolean = isLocalhost
): ModelExecutionAvailability {
  const execution = model.execution ?? UNKNOWN_MODEL_EXECUTION;
  if (
    execution.execution_site !== "nodetool_host" ||
    !nodetoolHostIsLocal
  ) {
    return execution;
  }
  return {
    ...execution,
    kind: "local",
    label: "Local",
    reason:
      execution.state === "download_required"
        ? "Download the model files before using it locally."
        : execution.runtime_name
          ? `Runs through ${execution.runtime_name} on this device.`
          : "Runs on this device."
  };
}

export function executionLabelsByProvider(
  models: readonly ModelSelectorModel[],
  nodetoolHostIsLocal: boolean = isLocalhost
): Map<string, Set<ModelExecutionAvailability["label"]>> {
  const labels = new Map<
    string,
    Set<ModelExecutionAvailability["label"]>
  >();
  for (const model of models) {
    if (!model.provider) continue;
    const providerLabels = labels.get(model.provider) ?? new Set();
    providerLabels.add(
      executionForDisplay(model, nodetoolHostIsLocal).label
    );
    labels.set(model.provider, providerLabels);
  }
  return labels;
}

type NormalizedModelMeta = {
  sizeB?: number; // billions of params
  sizeBucket?: "1-2B" | "3-7B" | "8-15B" | "16-34B" | "35-70B" | "70B+";
  typeTags: string[]; // ["instruct","chat","base","sft","dpo","reasoning","code","math"]
  family?: string; // llama, qwen, mistral, gemma, phi, yi, deepseek, qwq, granite
  moe?: string; // e.g., 8x7B
};

const bucketSizeByB = (b?: number) => {
  if (b === null || b === undefined) {
    return undefined;
  }
  if (b <= 2) {
    return "1-2B";
  }
  if (b <= 7) {
    return "3-7B";
  }
  if (b <= 15) {
    return "8-15B";
  }
  if (b <= 34) {
    return "16-34B";
  }
  if (b <= 70) {
    return "35-70B";
  }
  return "70B+";
};

export function normalizeModelMeta(m: ModelSelectorModel): NormalizedModelMeta {
  const text = `${m.name ?? ""} ${m.id ?? ""}`.toLowerCase();

  const typeTags = [
    /instruct/.test(text) && "instruct",
    /\bchat\b/.test(text) && "chat",
    /\bbase\b/.test(text) && "base",
    /\bsft\b/.test(text) && "sft",
    /\bdpo\b/.test(text) && "dpo",
    /(reason|r1|qwq)/.test(text) && "reasoning",
    /(code|coder)/.test(text) && "code",
    /\bmath\b/.test(text) && "math"
  ].filter((v): v is string => Boolean(v));

  const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(b|m)\b/);
  const sizeB = sizeMatch
    ? sizeMatch[2] === "m"
      ? parseFloat(sizeMatch[1]) / 1000
      : parseFloat(sizeMatch[1])
    : undefined;

  const familyMatch = text.match(
    /\b(llama|mistral|mixtral|qwen|gemma|phi|yi|deepseek|qwq|granite)\b/
  );
  const family = familyMatch ? familyMatch[1].toLowerCase() : undefined;

  const moeMatch = text.match(/(\d+)\s*[x×]\s*(\d+)\s*b/);
  const moe = moeMatch ? `${moeMatch[1]}x${moeMatch[2]}B` : undefined;

  return {
    sizeB,
    sizeBucket: bucketSizeByB(sizeB),
    typeTags,
    family,
    moe
  };
}

interface AdvancedModelFilters {
  selectedTypes: TypeTag[];
  sizeBucket: SizeBucket | null;
  families: string[];
}

export function applyAdvancedModelFilters<TModel extends ModelSelectorModel>(
  models: TModel[],
  filters: AdvancedModelFilters
): TModel[] {
  const { selectedTypes, sizeBucket, families } = filters;

  if (
    selectedTypes.length === 0 &&
    sizeBucket === null &&
    families.length === 0
  ) {
    return models;
  }

  return models.filter((model) => {
    const meta = normalizeModelMeta(model);

    if (selectedTypes.length > 0) {
      const hasMatchingType = selectedTypes.some((t) =>
        meta.typeTags.includes(t)
      );
      if (!hasMatchingType) {
        return false;
      }
    }

    if (sizeBucket !== null) {
      if (meta.sizeBucket !== sizeBucket) {
        return false;
      }
    }

    if (families.length > 0) {
      if (!meta.family || !families.includes(meta.family)) {
        return false;
      }
    }

    return true;
  });
}

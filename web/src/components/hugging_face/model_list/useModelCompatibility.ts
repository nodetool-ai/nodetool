import { useCallback, useMemo } from "react";
import log from "loglevel";
import type {
  NodeMetadata,
  Property,
  UnifiedModel
} from "../../../stores/ApiTypes";
import useMetadataStore from "../../../stores/MetadataStore";

export type CompatibilityMatchKind =
  | "recommendation"
  | "property"
  | "recommended_type"
  | "pipeline";

/**
 * Interface for a node that is compatible with a given model.
 */
export interface NodeCompatibilityInfo {
  nodeType: string;
  title: string;
  namespace: string;
  propertyNames: string[];
  matchedBy: CompatibilityMatchKind;
}

/**
 * Result of the model compatibility check, splitting nodes into recommended
 * (high confidence) and compatible (potential matches).
 */
export interface ModelCompatibilityResult {
  recommended: NodeCompatibilityInfo[];
  compatible: NodeCompatibilityInfo[];
}

const HF_WARN_LIMIT = 10;
const loggedHfModelIds = new Set<string>();
const missingSummary = new Map<
  string,
  { count: number; sampleIds: Set<string> }
>();
let missingSummaryTimeout: number | null = null;

type CompatibilityMap = Map<string, NodeCompatibilityInfo[]>;


const IMAGE_TYPES = new Set([
  "hf.text_to_image",
  "hf.flux",
  "hf.stable_diffusion",
  "hf.stable_diffusion_xl",
  "hf.pixart",
  "hf.qwen_image",
  "hf.image_to_image",
  "hf.inpainting",
  "hf.controlnet",
  "hf.controlnet_flux",
  "hf.ip_adapter",
  "hf.lora",
  "hf.lora_flux",
  "hf.vae",
  "hf.unet",
  "hf.clip",
  "hf.t5",
  "hf.flux_kontext"
]);
const VIDEO_TYPES = new Set(["hf.text_to_video", "hf.image_to_video"]);
const AUDIO_TYPES = new Set([
  "hf.automatic_speech_recognition",
  "hf.text_to_speech",
  "hf.zero_shot_audio_classification"
]);

const resolveDomain = (typeName?: string | null) => {
  const normalized = normalize(typeName);
  if (!normalized) { return null; }
  if (IMAGE_TYPES.has(normalized)) {
    return "image";
  }
  if (VIDEO_TYPES.has(normalized)) {
    return "video";
  }
  if (AUDIO_TYPES.has(normalized)) {
    return "audio";
  }
  return null;
};

const normalize = (value?: string | null) =>
  value ? value.trim().toLowerCase() : undefined;

const isModelPropertyType = (property: Property): string | undefined => {
  const baseType = property.type?.type;
  if (!baseType) {
    return undefined;
  }
  const normalized = baseType.toLowerCase();

  if (normalized.startsWith("hf.")) {
    return normalized;
  }

  if (normalized.endsWith("_model") || normalized.endsWith("_models")) {
    return normalized;
  }

  return undefined;
};

const toInfo = (
  node: NodeMetadata,
  matchedBy: CompatibilityMatchKind,
  propertyNames: string[] = []
): NodeCompatibilityInfo => ({
  nodeType: node.node_type,
  title: node.title,
  namespace: node.namespace,
  propertyNames,
  matchedBy
});

const upsert = (
  map: CompatibilityMap,
  key: string,
  info: NodeCompatibilityInfo
) => {
  if (!key) { return; }
  const existing = map.get(key) ?? [];
  map.set(key, [...existing, info]);
};

const expandRepoKeys = (
  repoId?: string | null,
  id?: string | null,
  path?: string | null
) => {
  const keys = new Set<string>();
  const add = (value?: string | null) => {
    const key = normalize(value);
    if (!key) { return; }
    keys.add(key);
    if (key.includes(":")) {
      keys.add(key.split(":")[0]);
    }
  };

  add(repoId);
  add(id);

  const normalizedPath = normalize(path);
  if (normalizedPath) {
    keys.add(normalizedPath);
  }

  const repoKey = normalize(repoId);
  if (repoKey && normalizedPath) {
    keys.add(`${repoKey}/${normalizedPath}`);
  }

  const idKey = normalize(id);
  if (idKey && normalizedPath) {
    keys.add(`${idKey}/${normalizedPath}`);
  }

  return Array.from(keys);
};

const expandTypeVariants = (typeName: string): string[] => {
  const normalized = normalize(typeName);
  if (!normalized) { return []; }

  const variants = new Set<string>();
  variants.add(normalized);

  const noNamespace = normalized.includes(".")
    ? normalized.slice(normalized.indexOf(".") + 1)
    : normalized;

  const slugVersions = [
    normalized.replace(/_/g, "-"),
    normalized.replace(/-/g, "_")
  ];

  slugVersions.forEach((variant) => variants.add(variant));

  const nsVariants = new Set<string>();
  if (noNamespace && noNamespace !== normalized) {
    nsVariants.add(noNamespace);
    nsVariants.add(noNamespace.replace(/_/g, "-"));
    nsVariants.add(noNamespace.replace(/-/g, "_"));
  }
  nsVariants.forEach((variant) => variants.add(variant));

  return Array.from(variants);
};

const expandModelTypeCandidates = (model: UnifiedModel) => {
  const candidates = new Set<string>();
  const lockedDomain = resolveDomain(model.type)
    ?? resolveDomain(model.pipeline_tag ? `hf.${model.pipeline_tag.replace(/-/g, "_")}` : null);
  const add = (key?: string | null) => {
    const normalized = normalize(key);
    if (normalized) {
      candidates.add(normalized);
    }
  };

  if (model.type) {
    add(model.type);
  }

  if (model.pipeline_tag) {
    const pipelineSlug = model.pipeline_tag.replace(/-/g, "_").toLowerCase();
    const pipelineType = `hf.${pipelineSlug}`;
    const pipelineDomain = resolveDomain(pipelineType);
    if (!lockedDomain || !pipelineDomain || pipelineDomain === lockedDomain) {
      add(pipelineType);
    }
  }

  return Array.from(candidates);
};

/**
 * A hook that provides a function to check node compatibility for a given Hugging Face model.
 *
 * The compatibility logic works by pre-building indices of all available nodes based on:
 * 1. Recommended models (repo_id, path) - Highest confidence match.
 * 2. Property types (e.g. hf.flux) - Architecture-specific matching.
 * 3. Recommended model types - Matches models against nodes that recommend similar model types.
 *
 * Matching Strategy:
 * - Repo matches first: Exact repo/path matches are considered recommended.
 * - Type and pipeline matching: Uses model.type and pipeline_tag to find compatible nodes.
 * - Domain locking: Pipeline matches are allowed only when they align with the model's domain.
 * - Strict recommendations: Generic pipeline types are excluded from matching via recommendation lists
 *   to prevent false positives from nodes that merely recommend 'some' pipeline model without
 *   having a matching input property.
 */
export const useModelCompatibility = () => {
  const metadata = useMetadataStore((state) => state.metadata);

  const {
    nodesByRepoId,
    nodesByModelType,
    nodesByRecommendedType
  } = useMemo(() => {
    const repoMap: CompatibilityMap = new Map();
    const typeMap: CompatibilityMap = new Map();
    const recommendedTypeMap: CompatibilityMap = new Map();

    Object.values(metadata).forEach((node) => {
      node.recommended_models.forEach((model) => {
        const repoKeys = expandRepoKeys(model.repo_id, model.id, model.path);
        repoKeys.forEach((key) =>
          upsert(repoMap, key, toInfo(node, "recommendation"))
        );

        const recommendedType = normalize(model.type);
        if (recommendedType) {
          upsert(
            recommendedTypeMap,
            recommendedType,
            toInfo(node, "recommended_type")
          );
        }
      });

      node.properties.forEach((property) => {
        const propertyType = isModelPropertyType(property);
        if (!propertyType) { return; }
        const variants = expandTypeVariants(propertyType);
        variants.forEach((key) =>
          upsert(
            typeMap,
            key,
            toInfo(node, "property", [property.title ?? property.name])
          )
        );
      });
    });

    return {
      nodesByRepoId: repoMap,
      nodesByModelType: typeMap,
      nodesByRecommendedType: recommendedTypeMap
    };
  }, [metadata]);

  const getModelCompatibility = useCallback(
    (model: UnifiedModel | null | undefined): ModelCompatibilityResult => {
      if (!model) {
        return { recommended: [], compatible: [] };
      }

      const recommendedMap = new Map<string, NodeCompatibilityInfo>();
      const compatibleMap = new Map<string, NodeCompatibilityInfo>();

      const addToMap = (
        map: Map<string, NodeCompatibilityInfo>,
        incoming: NodeCompatibilityInfo
      ) => {
        const existing = map.get(incoming.nodeType);
        if (!existing) {
          map.set(incoming.nodeType, incoming);
          return;
        }

        map.set(incoming.nodeType, {
          ...existing,
          propertyNames: Array.from(
            new Set([...existing.propertyNames, ...incoming.propertyNames])
          )
        });
      };

      const collectMatches = (
        keys: string[],
        sourceMap: CompatibilityMap,
        targetMap: Map<string, NodeCompatibilityInfo>
      ) => {
        keys.forEach((key) => {
          if (!key) { return; }
          sourceMap.get(key)?.forEach((info) => {
            if (targetMap === compatibleMap && recommendedMap.has(info.nodeType)) {
              return;
            }
            addToMap(targetMap, info);
          });
        });
      };

      const repoKeys = expandRepoKeys(model.repo_id, model.id, model.path);
      if (repoKeys.length > 0) {
        collectMatches(repoKeys, nodesByRepoId, recommendedMap);
      }

      const typeCandidates = expandModelTypeCandidates(model);
      const expandedTypeKeys = typeCandidates.flatMap((candidate) =>
        expandTypeVariants(candidate)
      );

      collectMatches(expandedTypeKeys, nodesByModelType, compatibleMap);

      // For recommended types, only allow matching on specific architectures,
      // not generic pipeline categories, to avoid over-matching.
      const specificTypeKeys = expandedTypeKeys.filter(
        (k) =>
          !["hf.text_to_image", "hf.image_to_image", "hf.text_to_video", "hf.image_to_video"].includes(k)
      );
      collectMatches(specificTypeKeys, nodesByRecommendedType, compatibleMap);

      const recommended = Array.from(recommendedMap.values());
      const compatible = Array.from(compatibleMap.values());

      if (
        model.type?.startsWith("hf.") &&
        recommended.length === 0 &&
        compatible.length === 0 &&
        loggedHfModelIds.size < HF_WARN_LIMIT &&
        !loggedHfModelIds.has(model.id)
      ) {
        loggedHfModelIds.add(model.id);

        const summaryKey = normalize(model.type) || "unknown";
        const summaryEntry =
          missingSummary.get(summaryKey) ?? { count: 0, sampleIds: new Set() };
        summaryEntry.count += 1;
        if (summaryEntry.sampleIds.size < 5) {
          summaryEntry.sampleIds.add(model.id);
        }
        missingSummary.set(summaryKey, summaryEntry);

        if (!missingSummaryTimeout) {
          missingSummaryTimeout = window.setTimeout(() => {
            const summary = Array.from(missingSummary.entries()).map(
              ([type, entry]) => ({
                type,
                count: entry.count,
                sampleIds: Array.from(entry.sampleIds)
              })
            );
            log.warn("[ModelCompatibility] HF models missing coverage", summary);
            missingSummary.clear();
            missingSummaryTimeout = null;
          }, 1500);
        }
      }

      return {
        recommended,
        compatible
      };
    },
    [nodesByRepoId, nodesByModelType, nodesByRecommendedType]
  );

  return { getModelCompatibility };
};

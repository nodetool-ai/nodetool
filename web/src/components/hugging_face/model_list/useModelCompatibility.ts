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
  | "pipeline"
  | "tag";

export interface NodeCompatibilityInfo {
  nodeType: string;
  title: string;
  namespace: string;
  propertyNames: string[];
  matchedBy: CompatibilityMatchKind;
}

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

const NORMALIZED_MODEL_HINTS = [
  "hf.",
  "llama",
  "language_model",
  "tts",
  "asr",
  "mlx",
  "gguf"
];

const EXACT_MODEL_TYPES = new Set([
  "model",
  "model_ref",
  "model_path",
  "hf.model",
  "llama_model",
  "language_model",
  "tts_model",
  "asr_model"
]);

const HF_TEXT_TO_IMAGE_HINTS = [
  "text_to_image",
  "stable_diffusion",
  "flux",
  "pixart",
  "qwen_image",
  "ip_adapter",
  "unet",
  "vae",
  "clip",
  "t5"
];

const HF_IMAGE_TO_IMAGE_HINTS = [
  "image_to_image",
  "inpainting",
  "outpainting",
  "controlnet",
  "image_to_text"
];

const HF_TEXT_TO_VIDEO_HINTS = ["text_to_video"];
const HF_IMAGE_TO_VIDEO_HINTS = ["image_to_video"];

const HF_ASR_HINTS = ["automatic_speech_recognition", "asr"];
const HF_TTS_HINTS = ["text_to_speech", "tts"];

const normalize = (value?: string | null) =>
  value ? value.trim().toLowerCase() : undefined;

const containsModelHint = (typeName: string) =>
  NORMALIZED_MODEL_HINTS.some((hint) => typeName.includes(hint));

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

  if (EXACT_MODEL_TYPES.has(normalized)) {
    return normalized;
  }

  if (containsModelHint(normalized)) {
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
  if (!key) return;
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
    if (!key) return;
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
  if (!normalized) return [];

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

const mapSlugToCanonicalType = (slug: string): string | undefined => {
  if (HF_TEXT_TO_IMAGE_HINTS.some((hint) => slug.includes(hint))) {
    return "hf.text_to_image";
  }
  if (HF_IMAGE_TO_IMAGE_HINTS.some((hint) => slug.includes(hint))) {
    return "hf.image_to_image";
  }
  if (HF_TEXT_TO_VIDEO_HINTS.some((hint) => slug.includes(hint))) {
    return "hf.text_to_video";
  }
  if (HF_IMAGE_TO_VIDEO_HINTS.some((hint) => slug.includes(hint))) {
    return "hf.image_to_video";
  }
  if (HF_ASR_HINTS.some((hint) => slug.includes(hint))) {
    return "hf.automatic_speech_recognition";
  }
  if (HF_TTS_HINTS.some((hint) => slug.includes(hint))) {
    return "hf.text_to_speech";
  }
  return undefined;
};

const expandModelTypeCandidates = (model: UnifiedModel) => {
  const candidates = new Set<string>();
  const add = (key?: string | null) => {
    const normalized = normalize(key);
    if (normalized) candidates.add(normalized);
  };

  add(model.type);

  if (model.type?.startsWith("hf.")) {
    const slug = model.type.slice(3).toLowerCase();
    const canonical = mapSlugToCanonicalType(slug);
    if (canonical) {
      add(canonical);
    }
  }

  if (model.pipeline_tag) {
    const pipelineSlug = model.pipeline_tag.replace(/-/g, "_").toLowerCase();
    add(`hf.${pipelineSlug}`);
    const canonical = mapSlugToCanonicalType(pipelineSlug);
    if (canonical) {
      add(canonical);
    }
  }

  (model.tags || []).forEach((tag) => {
    const tagSlug = tag.replace(/-/g, "_").toLowerCase();
    const canonical = mapSlugToCanonicalType(tagSlug);
    if (canonical) {
      add(canonical);
    }
  });

  return Array.from(candidates);
};

export const useModelCompatibility = () => {
  const metadata = useMetadataStore((state) => state.metadata);

  const {
    nodesByRepoId,
    nodesByModelType,
    nodesByRecommendedType,
    nodesByPipelineTag,
    nodesByTag
  } = useMemo(() => {
    const repoMap: CompatibilityMap = new Map();
    const typeMap: CompatibilityMap = new Map();
    const recommendedTypeMap: CompatibilityMap = new Map();
    const pipelineMap: CompatibilityMap = new Map();
    const tagMap: CompatibilityMap = new Map();

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

        const pipeline = normalize(model.pipeline_tag);
        if (pipeline) {
          upsert(pipelineMap, pipeline, toInfo(node, "pipeline"));
        }

        (model.tags || [])
          .map((tag) => normalize(tag))
          .filter(Boolean)
          .forEach((tag) => {
            if (tag) {
              upsert(tagMap, tag, toInfo(node, "tag"));
            }
          });
      });

      node.properties.forEach((property) => {
        const propertyType = isModelPropertyType(property);
        if (!propertyType) return;
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
      nodesByRecommendedType: recommendedTypeMap,
      nodesByPipelineTag: pipelineMap,
      nodesByTag: tagMap
    };
  }, [metadata]);

  useMemo(() => {
    log.debug("[ModelCompatibility] maps built", {
      metadataEntries: Object.keys(metadata).length,
      repoKeys: nodesByRepoId.size,
      propertyTypeKeys: nodesByModelType.size,
      recommendedTypeKeys: nodesByRecommendedType.size,
      pipelineKeys: nodesByPipelineTag.size,
      tagKeys: nodesByTag.size
    });
  }, [
    metadata,
    nodesByRepoId,
    nodesByModelType,
    nodesByRecommendedType,
    nodesByPipelineTag,
    nodesByTag
  ]);

  useMemo(() => {
    // Debug logging for specific nodes
    const debugTypes = ["AudioClassifier", "DepthEstimation", "Whisper"];
    const debugNodes = Object.values(metadata).filter((n) =>
      debugTypes.some((t) => n.node_type.includes(t))
    );
    if (debugNodes.length > 0) {
      log.info("[ModelCompatibility] Found debug nodes:", debugNodes.map(n => ({
        type: n.node_type,
        properties: n.properties.map(p => ({ name: p.name, type: p.type }))
      })));
    } else {
      log.warn("[ModelCompatibility] No nodes found matching debug types:", debugTypes);
    }

    const hfKeys = Array.from(nodesByModelType.keys()).filter((k) =>
      k.startsWith("hf.")
    );
    log.info("[ModelCompatibility] nodesByModelType keys (hf.*):", hfKeys);
  }, [metadata, nodesByModelType]);

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
          if (!key) return;
          sourceMap.get(key)?.forEach((info) => {
            if (targetMap === compatibleMap && recommendedMap.has(info.nodeType)) {
              return;
            }
            addToMap(targetMap, info);
          });
        });
      };

      const repoKeys = expandRepoKeys(model.repo_id, model.id, model.path);
      const recommendedMatches = repoKeys.filter((key) =>
        nodesByRepoId.has(key)
      );
      if (repoKeys.length > 0) {
        collectMatches(repoKeys, nodesByRepoId, recommendedMap);
      }

      const typeCandidates = expandModelTypeCandidates(model);
      const expandedTypeKeys = typeCandidates.flatMap((candidate) =>
        expandTypeVariants(candidate)
      );
      collectMatches(expandedTypeKeys, nodesByModelType, compatibleMap);
      collectMatches(expandedTypeKeys, nodesByRecommendedType, compatibleMap);

      const pipelineKey = normalize(model.pipeline_tag);
      if (pipelineKey) {
        collectMatches([pipelineKey], nodesByPipelineTag, compatibleMap);
      }

      const tagKeys = (model.tags || [])
        .map((tag) => normalize(tag))
        .filter(Boolean) as string[];
      if (tagKeys.length > 0) {
        collectMatches(tagKeys, nodesByTag, compatibleMap);
      }

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

        const repoKeysMatched = repoKeys.filter((key) =>
          nodesByRepoId.has(key)
        );
        const typeKeysMatched = expandedTypeKeys.filter((key) =>
          nodesByModelType.has(key)
        );
        const recTypeKeysMatched = expandedTypeKeys.filter((key) =>
          nodesByRecommendedType.has(key)
        );
        const pipelineMatched = pipelineKey
          ? nodesByPipelineTag.has(pipelineKey)
          : false;
        const tagKeysMatched = tagKeys.filter((key) => nodesByTag.has(key));

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
        recommended: Array.from(recommendedMap.values()),
        compatible: Array.from(compatibleMap.values())
      };
    },
    [
      nodesByRepoId,
      nodesByModelType,
      nodesByRecommendedType,
      nodesByPipelineTag,
      nodesByTag
    ]
  );

  return { getModelCompatibility };
};



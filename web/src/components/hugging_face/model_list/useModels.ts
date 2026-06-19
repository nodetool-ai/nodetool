import { useEffect, useMemo, useState } from "react";
import { trpc } from "../../../lib/trpc";
import { UnifiedModel } from "../../../stores/ApiTypes";
import {
  groupModelsByType,
  sortModelTypes
} from "../../../utils/modelFormatting";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";
import type {
  ModelSortField,
  ModelSortDirection,
  ModelScope
} from "../../../stores/ModelManagerStore";
import { useQuery } from "@tanstack/react-query";
import { openInExplorer, openOllamaPath } from "../../../utils/fileExplorer";
import { isHfModel } from "../../../utils/hfCache";
import { isLocalProvider } from "../../../utils/providerDisplay";
import useMetadataStore from "../../../stores/MetadataStore";

/**
 * HuggingFace Hub pipeline tags, shown as the fixed category list when browsing
 * the Hub (where there are no results to derive categories from until a search
 * runs). Dash-cased here; the sidebar/types use the underscore-prefixed
 * `hf.<task>` form, and the Hub query maps the selected type back to this tag.
 */
const HF_HUB_PIPELINE_TAGS = [
  "text-generation",
  "text-classification",
  "text2text-generation",
  "fill-mask",
  "token-classification",
  "question-answering",
  "zero-shot-classification",
  "translation",
  "summarization",
  "feature-extraction",
  "sentence-similarity",
  "text-to-image",
  "image-to-image",
  "image-to-text",
  "image-text-to-text",
  "text-to-video",
  "image-to-video",
  "image-classification",
  "object-detection",
  "image-segmentation",
  "depth-estimation",
  "mask-generation",
  "zero-shot-image-classification",
  "visual-question-answering",
  "document-question-answering",
  "text-to-speech",
  "text-to-audio",
  "automatic-speech-recognition",
  "audio-to-audio",
  "audio-classification",
  "audio-text-to-text",
  "video-text-to-text",
  "any-to-any"
] as const;

const HF_HUB_CATEGORY_TYPES = HF_HUB_PIPELINE_TAGS.map(
  (tag) => `hf.${tag.replace(/-/g, "_")}`
);

/**
 * Max results requested from the Hub per search. The Hub paginates beyond this,
 * so a result count equal to the limit means "at least this many" — the UI
 * labels it as a capped top-N rather than a definitive total.
 */
export const HUB_RESULT_LIMIT = 50;

/**
 * The Models Manager only lists models that live on disk: downloadable
 * HuggingFace / transformers.js repos and local runtimes (Ollama, llama.cpp,
 * MLX). Cloud API models (OpenAI, Anthropic, …) are configured via API keys
 * rather than downloaded, so they don't belong here.
 */
export const isManageableModel = (model: UnifiedModel): boolean => {
  if (isHfModel(model)) {
    return true;
  }
  const type = model.type ?? "";
  if (type === "llama_model" || type.startsWith("tjs")) {
    return true;
  }
  return isLocalProvider(model.provider ?? undefined);
};

const sortModels = (
  models: UnifiedModel[],
  field: ModelSortField,
  direction: ModelSortDirection
): UnifiedModel[] => {
  const sorted = [...models].sort((a, b) => {
    switch (field) {
      case "name": {
        const nameA = (a.name || a.id || "").toLowerCase();
        const nameB = (b.name || b.id || "").toLowerCase();
        return nameA.localeCompare(nameB);
      }
      case "size":
        return (a.size_on_disk || 0) - (b.size_on_disk || 0);
      case "downloads":
        return (a.downloads || 0) - (b.downloads || 0);
      case "likes":
        return (a.likes || 0) - (b.likes || 0);
      default:
        return 0;
    }
  });
  return direction === "desc" ? sorted.reverse() : sorted;
};

export interface UseModelsResult {
  modelTypes: string[];
  availableModelTypes: Set<string>;
  modelCountsByType: Record<string, number>;
  allModels: UnifiedModel[] | undefined;
  groupedModels: Record<string, UnifiedModel[]>;
  filteredModels: UnifiedModel[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  handleShowInExplorer: (modelId: string) => Promise<void>;
}

export const useModels = (scope: ModelScope = "local"): UseModelsResult => {
  const modelSearchTerm = useModelManagerStore((state) => state.modelSearchTerm);
  const selectedModelType = useModelManagerStore((state) => state.selectedModelType);
  const maxModelSizeGB = useModelManagerStore((state) => state.maxModelSizeGB);
  const sortField = useModelManagerStore((state) => state.sortField);
  const sortDirection = useModelManagerStore((state) => state.sortDirection);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const source = useModelManagerStore((state) => state.source);
  const recommendedCatalog = useMetadataStore((state) => state.recommendedModels);

  const {
    data: rawModels,
    isLoading,
    isFetching,
    error
  } = useQuery({
    queryKey: ["allModels", scope],
    queryFn: (): Promise<UnifiedModel[]> =>
      scope === "worker"
        ? (trpc.models.huggingfaceList.query({
            scope: "worker"
          }) as Promise<UnifiedModel[]>)
        : trpc.models.all.query(),
    // The recommended catalog comes from already-loaded node metadata, so the
    // on-disk query is unnecessary while browsing it.
    enabled: source === "installed",
    refetchOnWindowFocus: false
  });

  // Debounce the search term so each keystroke doesn't fire a Hub request.
  const [debouncedSearch, setDebouncedSearch] = useState(modelSearchTerm);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(modelSearchTerm), 350);
    return () => clearTimeout(t);
  }, [modelSearchTerm]);

  // In Hub mode, a selected `hf.<task>` type maps to the Hub's dash-cased
  // pipeline tag (e.g. hf.audio_text_to_text → audio-text-to-text).
  const hubPipelineTag = useMemo(() => {
    if (source !== "hub" || !selectedModelType.startsWith("hf.")) {
      return undefined;
    }
    return selectedModelType.slice(3).replace(/_/g, "-");
  }, [source, selectedModelType]);

  const {
    data: hubModels,
    isLoading: hubLoading,
    isFetching: hubFetching,
    error: hubError
  } = useQuery({
    queryKey: ["hubModels", debouncedSearch, hubPipelineTag],
    queryFn: (): Promise<UnifiedModel[]> =>
      trpc.models.huggingfaceHubSearch.query({
        query: debouncedSearch || undefined,
        pipeline_tag: hubPipelineTag,
        limit: HUB_RESULT_LIMIT
      }) as Promise<UnifiedModel[]>,
    // Don't hit the Hub until there's something to search by.
    enabled:
      source === "hub" &&
      (debouncedSearch.trim().length > 1 || hubPipelineTag !== undefined),
    refetchOnWindowFocus: false
  });

  const allModels = useMemo(() => {
    if (source === "recommended") return recommendedCatalog;
    if (source === "hub") return hubModels;
    return rawModels?.filter(isManageableModel);
  }, [source, recommendedCatalog, hubModels, rawModels]);

  const groupedModels = useMemo(
    () => groupModelsByType(allModels || []),
    [allModels]
  );

  const filteredModels: UnifiedModel[] = useMemo(() => {
    const filterModel = (model: UnifiedModel) => {
      const searchTerm = modelSearchTerm.toLowerCase();
      // Hub results are already filtered server-side by the search query, so
      // don't re-filter by text (avoids hiding valid hits during debounce).
      const matchesText =
        source === "hub" ||
        model.name?.toLowerCase().includes(searchTerm) ||
        model.repo_id?.toLowerCase().includes(searchTerm);
      // When counting "filtered" models, we do NOT filter by type here if "All" is selected,
      // because the count logic is handled differently or we want the total count to reflect
      // all models matching search/size/download status.
      // HOWEVER, if the user selects a specific type, we DO filter by it.
      const typeMatches =
        selectedModelType === "All" || model.type === selectedModelType;

      if (!matchesText) {return false;}
      if (!typeMatches) {return false;}
      if (
        maxModelSizeGB &&
        model.size_on_disk &&
        model.size_on_disk > maxModelSizeGB * 1024 ** 3
      )
        {return false;}

      return true;
    };
    const filtered = allModels?.filter(filterModel) || [];
    return sortModels(filtered, sortField, sortDirection);
  }, [
    allModels,
    source,
    modelSearchTerm,
    selectedModelType,
    maxModelSizeGB,
    sortField,
    sortDirection
  ]);

  const modelTypes = useMemo(() => {
    const allTypes = new Set<string>();
    allTypes.add("All");

    // Hub mode: always offer the full pipeline-tag catalog so a category can be
    // picked before any search has run.
    if (source === "hub") {
      HF_HUB_CATEGORY_TYPES.forEach((t) => allTypes.add(t));
    }

    // Get unique types from all models
    allModels?.forEach((model) => {
      if (model.type) {
        allTypes.add(model.type);
      }
    });

    return sortModelTypes(Array.from(allTypes));
  }, [allModels, source]);

    // Get available model types based on current filters (for sidebar visibility)
  const availableModelTypes = useMemo(() => {
    const types = new Set<string>();
    types.add("All");

    // Hub mode: keep every pipeline-tag category visible (plus any from current
    // results) so the user can always pick one to drive the search.
    if (source === "hub") {
      HF_HUB_CATEGORY_TYPES.forEach((t) => types.add(t));
      allModels?.forEach((model) => {
        if (model.type) {
          types.add(model.type);
        }
      });
      return types;
    }

    // Get types from filtered models (excluding type filter)
    const modelsForTypeList =
      allModels?.filter((model) => {
        const searchTerm = modelSearchTerm.toLowerCase();
        const matchesText =
          model.name?.toLowerCase().includes(searchTerm) ||
          model.repo_id?.toLowerCase().includes(searchTerm);

        if (!matchesText) {return false;}
        if (
          maxModelSizeGB &&
          model.size_on_disk &&
          model.size_on_disk > maxModelSizeGB * 1024 ** 3
        )
          {return false;}

        return true;
      }) || [];

    modelsForTypeList.forEach((model) => {
      if (model.type) {
        types.add(model.type);
      }
    });

    return types;
  }, [allModels, source, modelSearchTerm, maxModelSizeGB]);

  const modelCountsByType = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredModels.forEach((model) => {
      const type = model.type || "unknown";
      counts[type] = (counts[type] || 0) + 1;
    });
    counts["All"] = filteredModels.length;
    return counts;
  }, [filteredModels]);

  const handleShowInExplorer = async (modelId: string) => {
    if (!modelId) {return;}

    const model = allModels?.find((m) => m.id === modelId);
    if (!model) {return;}

    const isOllama = model.type === "llama_model";

    if (isOllama) {
      await openOllamaPath();
    } else if (model.path) {
      await openInExplorer(model.path);
    } else {
      addNotification({
        type: "warning",
        content: `Could not determine path for model ${modelId}`,
        dismissable: true
      });
    }
  };

  // Surface the loading/error state of whichever source is active.
  const activeLoading =
    source === "hub" ? hubLoading : source === "installed" ? isLoading : false;
  const activeFetching = source === "hub" ? hubFetching : isFetching;
  const activeError = source === "hub" ? hubError : error;

  return {
    modelTypes,
    availableModelTypes,
    modelCountsByType,
    allModels,
    groupedModels,
    filteredModels,
    isLoading: activeLoading,
    isFetching: activeFetching,
    error: activeError,
    handleShowInExplorer
  };
};

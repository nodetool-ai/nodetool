import { create } from "zustand";
import type {
  ImageModel,
  LanguageModel,
  EmbeddingModel,
  TTSModel,
  ASRModel,
  VideoModel
} from "./ApiTypes";
import Fuse from "fuse.js";
import useModelPreferencesStore from "./ModelPreferencesStore";
import React from "react";
import { useSecrets } from "../hooks/useSecrets";

export type SidebarTab = "favorites" | "recent";

export type EnabledProvidersMap = Record<string, boolean>;

export interface ModelSelectorModel {
  type: string;
  provider: string;
  id: string;
  name: string;
  path?: string | null;
  supported_tasks?: string[];
}

export type ModelType =
  | LanguageModel
  | ImageModel
  | TTSModel
  | ASRModel
  | VideoModel
  | EmbeddingModel;

export interface ModelMenuState<
  TModel extends ModelSelectorModel = LanguageModel
> {
  search: string;
  selectedProvider: string | null;
  activeSidebarTab: SidebarTab;
  models: TModel[];

  setSearch: (value: string) => void;
  setSelectedProvider: (provider: string | null) => void;
  setActiveSidebarTab: (tab: SidebarTab) => void;
  setAllModels: (models: TModel[]) => void;
}

const isAkiProviderIdentifier = (provider: string): boolean => {
  const normalized = provider.trim().toLowerCase();
  if (normalized === "aki" || normalized === "aki.io") {
    return true;
  }

  try {
    const candidate = normalized.includes("://")
      ? normalized
      : `https://${normalized}`;
    const host = new URL(candidate).hostname.toLowerCase();
    return host === "aki.io" || host.endsWith(".aki.io");
  } catch {
    // Not a valid URL-like provider identifier, treat as non-AKI.
    return false;
  }
};

export const requiredSecretForProvider = (provider?: string): string | null => {
  const p = (provider || "").toLowerCase();
  if (p.includes("openai")) {return "OPENAI_API_KEY";}
  if (p.includes("anthropic")) {return "ANTHROPIC_API_KEY";}
  if (p.includes("gemini") || p.includes("google")) {return "GEMINI_API_KEY";}
  if (p.includes("meshy")) {return "MESHY_API_KEY";}
  if (p.includes("rodin")) {return "RODIN_API_KEY";}
  if (p.includes("trellis")) {return "TRELLIS_API_KEY";}
  if (p.includes("tripo")) {return "TRIPO_API_KEY";}
  if (p.includes("hunyuan3d")) {return "HUNYUAN3D_API_KEY";}
  if (p.includes("shap_e") || p.includes("shap-e")) {return "SHAP_E_API_KEY";}
  if (p.includes("point_e") || p.includes("point-e")) {return "POINT_E_API_KEY";}
  if (p.includes("huggingface") || p.includes("hf_")) {return "HF_TOKEN";}
  if (p.includes("replicate")) {return "REPLICATE_API_TOKEN";}
  if (p.includes("fal")) {return "FAL_API_KEY";}
  if (p.includes("aime")) {return "AIME_API_KEY";}
  if (p.includes("moonshot") || p.includes("kimi")) {return "KIMI_API_KEY";}
  if (p.includes("minimax")) {return "MINIMAX_API_KEY";}
  if (p === "cohere") {return "COHERE_API_KEY";}
  if (p === "voyage" || p === "voyage-ai" || p === "voyageai") {return "VOYAGE_API_KEY";}
  if (p === "jina" || p === "jina-ai" || p === "jinaai") {return "JINA_API_KEY";}
  if (isAkiProviderIdentifier(p)) {return "AKI_API_KEY";}
  return null;
};

export const computeProvidersList = <TModel extends ModelSelectorModel>(
  models: TModel[] | undefined
): string[] => {
  const providerCounts = new Map<string, number>();
  (models ?? []).forEach((m) => {
    const provider = m.provider || "Other";
    providerCounts.set(provider, (providerCounts.get(provider) ?? 0) + 1);
  });

  const list = Array.from(providerCounts.entries())
    .filter(([, count]) => count > 0)
    .map(([provider]) => provider)
    .sort((a, b) => a.localeCompare(b));

  // Provider filtering removed - all providers from API are now shown

  return list;
};

export const filterModelsList = <TModel extends ModelSelectorModel>(
  models: TModel[] | undefined,
  selectedProvider: string | null,
  search: string,
  enabledProviders: EnabledProvidersMap | undefined
): TModel[] => {
  let list = models ?? [];

  if (selectedProvider) {
    if (/gemini|google/i.test(selectedProvider)) {
      list = list.filter((m) => /gemini|google/i.test(m.provider || ""));
    } else {
      list = list.filter((m) => m.provider === selectedProvider);
    }
  }
  if (!selectedProvider) {
    // Filter by enabled providers: missing key means enabled (default true)
    // Only filter out if explicitly set to false
    list = list.filter((m) => {
      const providerKey = String(m.provider || "");
      const isEnabled = enabledProviders?.[providerKey] !== false;
      return isEnabled;
    });
  }
  const term = search.trim();
  if (term.length > 0) {
    list = list.filter((m) => enabledProviders?.[m.provider || ""] !== false);
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    const makeIndexText = (m: TModel) =>
      normalize(`${m.name || ""} ${m.id || ""} ${m.provider || ""}`);
    const tokens = normalize(term).split(/\s+/).filter(Boolean);

    const tokenMatches = list.filter((m) => {
      const text = makeIndexText(m);
      return tokens.every((t) => text.includes(t));
    });

    const fuse = new Fuse(list, {
      keys: ["name", "id", "provider"],
      threshold: 0.3,
      ignoreLocation: true,
      distance: 1000,
      minMatchCharLength: 1
    });
    const fuseItems = fuse.search(term).map((r) => r.item);

    const merged: TModel[] = [...tokenMatches];
    for (const it of fuseItems) {
      if (!merged.includes(it)) {merged.push(it);}
    }
    return merged;
  }

  // Sort alphabetically by name (or id as fallback) when not searching
  return [...list].sort((a, b) => {
    const nameA = (a.path || a.name || a.id || "").toLowerCase();
    const nameB = (b.path || b.name || b.id || "").toLowerCase();
    return nameA.localeCompare(nameB);
  });
};

export type ModelMenuStoreHook<TModel extends ModelSelectorModel> = <Selected>(
  selector: (state: ModelMenuState<TModel>) => Selected,
  equalityFn?: (left: Selected, right: Selected) => boolean
) => Selected;

export const useModelMenuData = <TModel extends ModelSelectorModel>(
  models: TModel[] | undefined,
  storeHook: ModelMenuStoreHook<TModel>
) => {
  const { isApiKeySet } = useSecrets();
  const enabledProviders = useModelPreferencesStore((s) => s.enabledProviders);
  const favoritesSet = useModelPreferencesStore((s) => s.favorites);
  const recentsList = useModelPreferencesStore((s) => s.recents);
  const search = storeHook((s) => s.search);
  const selectedProvider = storeHook((s) => s.selectedProvider);

  const providers = React.useMemo(() => computeProvidersList(models), [models]);

  const filteredModels = React.useMemo(
    () => filterModelsList(models, selectedProvider, search, enabledProviders),
    [models, selectedProvider, search, enabledProviders]
  );

  const recentModels = React.useMemo(() => {
    const byKey = new Map<string, TModel>(
      (models ?? []).map((model) => [`${model.provider ?? ""}:${model.id ?? ""}`, model])
    );
    const mapped: TModel[] = [];
    recentsList.forEach((recentItem) => {
      const model = byKey.get(`${recentItem.provider}:${recentItem.id}`);
      if (model) {mapped.push(model);}
    });
    return mapped;
  }, [models, recentsList]);

  const favoriteModels = React.useMemo(() => {
    const keyHas = (provider?: string, id?: string) =>
      favoritesSet.has(`${provider ?? ""}:${id ?? ""}`);
    const filtered = (models ?? []).filter((m) => keyHas(m.provider, m.id));
    return [...filtered].sort((a, b) => {
      const nameA = (a.path || a.name || a.id || "").toLowerCase();
      const nameB = (b.path || b.name || b.id || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [models, favoritesSet]);

  const totalCount = models?.length ?? 0;
  const filteredCount = filteredModels.length;
  const totalActiveCount = React.useMemo(() => {
    const isEnabled = (p?: string) => enabledProviders?.[p || ""] !== false;
    const isEnvOk = (p?: string) => {
      const env = requiredSecretForProvider(p);
      if (!env) {return true;}
      return isApiKeySet(env);
    };
    return (
      models?.filter((m) => isEnabled(m.provider) && isEnvOk(m.provider))
        .length ?? 0
    );
  }, [models, enabledProviders, isApiKeySet]);

  return {
    models,
    providers,
    filteredModels,
    favoriteModels,
    recentModels,
    totalCount,
    filteredCount,
    totalActiveCount
  };
};

export const createModelMenuStore = <TModel extends ModelSelectorModel>() =>
  create<ModelMenuState<TModel>>((set) => ({
    search: "",
    selectedProvider: null,
    activeSidebarTab: "favorites",
    models: [],

    setSearch: (value: string) => set({ search: value }),
    setSelectedProvider: (provider: string | null) =>
      set({ selectedProvider: provider }),
    setActiveSidebarTab: (tab: SidebarTab) => set({ activeSidebarTab: tab }),
    setAllModels: (models: TModel[]) => set({ models: models })
  }));

export const useLanguageModelMenuStore = createModelMenuStore<LanguageModel>();
export const useImageModelMenuStore = createModelMenuStore<ImageModel>();
export const useTTSModelMenuStore = createModelMenuStore<TTSModel>();
export const useASRModelMenuStore = createModelMenuStore<ASRModel>();
export const useVideoModelMenuStore = createModelMenuStore<VideoModel>();
export const useHuggingFaceImageModelMenuStore = createModelMenuStore<ImageModel>();
export const useTransformersJsModelMenuStore = createModelMenuStore<ImageModel>();
export const useEmbeddingModelMenuStore = createModelMenuStore<EmbeddingModel>();

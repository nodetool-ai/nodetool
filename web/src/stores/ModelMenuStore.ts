import { create } from "zustand";
import type { ImageModel, LanguageModel, TTSModel, ASRModel, VideoModel } from "./ApiTypes";
import Fuse from "fuse.js";
import useRemoteSettingsStore from "./RemoteSettingStore";
import useModelPreferencesStore from "./ModelPreferencesStore";
import React from "react";
import { useSecrets } from "../hooks/useSecrets";

export type SidebarTab = "favorites" | "recent";

export type EnabledProvidersMap = Record<string, boolean>;

export type ModelSelectorModel = LanguageModel | ImageModel | TTSModel | ASRModel | VideoModel;

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

export const requiredSecretForProvider = (provider?: string): string | null => {
  const p = (provider || "").toLowerCase();
  if (p.includes("openai")) return "OPENAI_API_KEY";
  if (p.includes("anthropic")) return "ANTHROPIC_API_KEY";
  if (p.includes("gemini") || p.includes("google")) return "GEMINI_API_KEY";
  if (p.includes("huggingface") || p.includes("hf_")) return "HF_TOKEN";
  if (p.includes("replicate")) return "REPLICATE_API_TOKEN";
  if (p.includes("fal")) return "FAL_API_KEY";
  if (p.includes("aime")) return "AIME_API_KEY";
  return null;
};

export const ALL_PROVIDERS = [
  "openai",
  "anthropic",
  "gemini",
  "replicate",
  "ollama",
  "llama_cpp",
  "mlx",
  "fal_ai",
  "huggingface",
  "huggingface_black_forest_labs",
  "huggingface_fal_ai",
  "huggingface_hf_inference",
  "huggingface_replicate",
  "huggingface_nebius",
  // "aime"
];


// Image-specific providers
export const IMAGE_PROVIDERS = ALL_PROVIDERS;

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
    list = list.filter((m) => enabledProviders?.[m.provider || ""] !== false);
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
      if (!merged.includes(it)) merged.push(it);
    }
    return merged;
  }
  return list;
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

  const providers = React.useMemo(
    () => computeProvidersList(models),
    [models]
  );

  const filteredModels = React.useMemo(
    () => filterModelsList(models, selectedProvider, search, enabledProviders),
    [models, selectedProvider, search, enabledProviders]
  );

  const recentModels = React.useMemo(() => {
    const byKey = new Map<string, TModel>(
      (models ?? []).map((m) => [`${m.provider ?? ""}:${m.id ?? ""}`, m])
    );
    const mapped: TModel[] = [];
    recentsList.forEach((r) => {
      const m = byKey.get(`${r.provider}:${r.id}`);
      if (m) mapped.push(m);
    });
    return mapped;
  }, [models, recentsList]);

  const favoriteModels = React.useMemo(() => {
    const keyHas = (provider?: string, id?: string) =>
      favoritesSet.has(`${provider ?? ""}:${id ?? ""}`);
    return (models ?? []).filter((m) => keyHas(m.provider, m.id));
  }, [models, favoritesSet]);

  const totalCount = models?.length ?? 0;
  const filteredCount = filteredModels.length;
  const totalActiveCount = React.useMemo(() => {
    const isEnabled = (p?: string) => enabledProviders?.[p || ""] !== false;
    const isEnvOk = (p?: string) => {
      const env = requiredSecretForProvider(p);
      if (!env) return true;
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

export const createModelMenuSelector = <
  TModel extends ModelSelectorModel
>() => {
  const store = createModelMenuStore<TModel>();
  return {
    useStore: store,
    useData: (models?: TModel[]) =>
      useModelMenuData<TModel>(models, store)
  };
};

const languageModelMenu = createModelMenuSelector<LanguageModel>();
export const useLanguageModelMenuStore = languageModelMenu.useStore;
export const useLanguageModelMenuData = languageModelMenu.useData;

const imageModelMenu = createModelMenuSelector<ImageModel>();
export const useImageModelMenuStore = imageModelMenu.useStore;
export const useImageModelMenuData = imageModelMenu.useData;

// TTS-specific providers
export const TTS_PROVIDERS = ALL_PROVIDERS;

const ttsModelMenu = createModelMenuSelector<TTSModel>();
export const useTTSModelMenuStore = ttsModelMenu.useStore;
export const useTTSModelMenuData = ttsModelMenu.useData;

// ASR-specific providers
export const ASR_PROVIDERS = ALL_PROVIDERS;

const asrModelMenu = createModelMenuSelector<ASRModel>();
export const useASRModelMenuStore = asrModelMenu.useStore;
export const useASRModelMenuData = asrModelMenu.useData;

// Video-specific providers
export const VIDEO_PROVIDERS = ALL_PROVIDERS;

const videoModelMenu = createModelMenuSelector<VideoModel>();
export const useVideoModelMenuStore = videoModelMenu.useStore;
export const useVideoModelMenuData = videoModelMenu.useData;

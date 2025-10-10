import { create } from "zustand";
import type { ImageModel, LanguageModel, TTSModel, ASRModel, VideoModel } from "./ApiTypes";
import Fuse from "fuse.js";
import useRemoteSettingsStore from "./RemoteSettingStore";
import useModelPreferencesStore from "./ModelPreferencesStore";
import React from "react";

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
  if (p.includes("replicate")) return "REPLICATE_API_TOKEN";
  if (p.includes("fal")) return "FAL_API_KEY";
  if (p.includes("aime")) return "AIME_API_KEY";
  if (
    p.includes("llama_cpp") ||
    p.includes("llama-cpp") ||
    p.includes("llamacpp")
  )
    return null;
  return null;
};

export const isProviderAvailable = (
  provider?: string,
  secrets?: Record<string, string>,
  enabledProviders?: EnabledProvidersMap
): boolean => {
  if (!provider) return false;
  const p = (provider || "").toLowerCase();
  const enabled = enabledProviders?.[p] !== false;
  const env = requiredSecretForProvider(provider);
  const hasKey =
    !env || Boolean(secrets?.[env] && String(secrets?.[env]).trim().length > 0);
  return enabled && hasKey;
};

export const ALWAYS_INCLUDE_PROVIDERS = [
  "openai",
  "anthropic",
  "gemini",
  "replicate",
  "ollama",
  "llama_cpp",
  "mlx"
  // "aime"
];

export const alwaysIncludeProviders = ALWAYS_INCLUDE_PROVIDERS;

// Image-specific providers
export const IMAGE_PROVIDERS = [
  "openai",
  "huggingface",
  "huggingface_black_forest_labs",
  "huggingface_fal_ai",
  "huggingface_hf_inference",
  "huggingface_replicate",
  "huggingface_nebius",
  "mlx",
  "fal_ai",
  "replicate",
  "gemini"
];

export const computeProvidersList = <TModel extends ModelSelectorModel>(
  models: TModel[] | undefined,
  secrets: Record<string, string> | undefined,
  filterProviders?: string[]
): string[] => {
  const rawProviders = (models ?? []).map((m) => m.provider || "Other");
  const raw = Array.from(new Set(rawProviders));
  const baseList = raw.sort((a, b) => a.localeCompare(b));
  const list = Array.from(
    new Set([...baseList, ...ALWAYS_INCLUDE_PROVIDERS])
  ).sort((a, b) => a.localeCompare(b));

  // Apply filter if provided
  if (filterProviders && filterProviders.length > 0) {
    return list.filter((p) => filterProviders.includes(p));
  }

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
  storeHook: ModelMenuStoreHook<TModel>,
  filterProviders?: string[]
) => {
  const secrets = useRemoteSettingsStore((s) => s.secrets);
  const enabledProviders = useModelPreferencesStore((s) => s.enabledProviders);
  const favoritesSet = useModelPreferencesStore((s) => s.favorites);
  const recentsList = useModelPreferencesStore((s) => s.recents);
  const search = storeHook((s) => s.search);
  const selectedProvider = storeHook((s) => s.selectedProvider);

  const providers = React.useMemo(
    () => computeProvidersList(models, secrets, filterProviders),
    [models, secrets, filterProviders]
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
      const v = secrets?.[env];
      return Boolean(v && String(v).trim().length > 0);
    };
    return (
      models?.filter((m) => isEnabled(m.provider) && isEnvOk(m.provider))
        .length ?? 0
    );
  }, [models, enabledProviders, secrets]);

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
    useData: (models?: TModel[], filterProviders?: string[]) =>
      useModelMenuData<TModel>(models, store, filterProviders)
  };
};

const languageModelMenu = createModelMenuSelector<LanguageModel>();
export const useLanguageModelMenuStore = languageModelMenu.useStore;
export const useLanguageModelMenuData = languageModelMenu.useData;

const imageModelMenu = createModelMenuSelector<ImageModel>();
export const useImageModelMenuStore = imageModelMenu.useStore;
export const useImageModelMenuData = imageModelMenu.useData;

// TTS-specific providers
export const TTS_PROVIDERS = [
  "openai",
  "gemini",
  "huggingface",
  "huggingface_hf_inference",
  "mlx",
  "elevenlabs"
];

const ttsModelMenu = createModelMenuSelector<TTSModel>();
export const useTTSModelMenuStore = ttsModelMenu.useStore;
export const useTTSModelMenuData = ttsModelMenu.useData;

// ASR-specific providers
export const ASR_PROVIDERS = [
  "openai",
  "gemini",
  "huggingface",
  "huggingface_hf_inference",
  "mlx"
];

const asrModelMenu = createModelMenuSelector<ASRModel>();
export const useASRModelMenuStore = asrModelMenu.useStore;
export const useASRModelMenuData = asrModelMenu.useData;

// Video-specific providers
export const VIDEO_PROVIDERS = [
  "gemini",
  "openai",
  "huggingface",
  "huggingface_fal_ai",
  "huggingface_replicate",
  "huggingface_novita",
  "huggingface_hf_inference"
];

const videoModelMenu = createModelMenuSelector<VideoModel>();
export const useVideoModelMenuStore = videoModelMenu.useStore;
export const useVideoModelMenuData = videoModelMenu.useData;

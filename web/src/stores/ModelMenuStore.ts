import { create } from "zustand";
import type { LanguageModel } from "./ApiTypes";
import Fuse from "fuse.js";
import useRemoteSettingsStore from "./RemoteSettingStore";
import useModelPreferencesStore from "./ModelPreferencesStore";
import React from "react";

type SidebarTab = "favorites" | "recent";

type EnabledProvidersMap = Record<string, boolean>;

interface ModelMenuState {
  search: string;
  selectedProvider: string | null;
  activeSidebarTab: SidebarTab;
  models: LanguageModel[];

  setSearch: (value: string) => void;
  setSelectedProvider: (provider: string | null) => void;
  setActiveSidebarTab: (tab: SidebarTab) => void;
  setAllModels: (models: LanguageModel[]) => void;
}

export const requiredSecretForProvider = (provider?: string): string | null => {
  const p = (provider || "").toLowerCase();
  if (p.includes("openai")) return "OPENAI_API_KEY";
  if (p.includes("anthropic")) return "ANTHROPIC_API_KEY";
  if (p.includes("gemini") || p.includes("google")) return "GEMINI_API_KEY";
  if (p.includes("replicate")) return "REPLICATE_API_TOKEN";
  if (p.includes("aime")) return "AIME_API_KEY";
  // Local llama.cpp does not require a key
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
  "llama_cpp"
  // "aime"
];

export const computeProvidersList = (
  models: LanguageModel[] | undefined,
  secrets: Record<string, string> | undefined
): string[] => {
  const rawProviders = (models ?? []).map((m) => m.provider || "Other");
  const raw = Array.from(new Set(rawProviders));
  const baseList = raw.sort((a, b) => a.localeCompare(b));
  const list = Array.from(
    new Set([...baseList, ...ALWAYS_INCLUDE_PROVIDERS])
  ).sort((a, b) => a.localeCompare(b));

  return list;
};

export const filterModelsList = (
  models: LanguageModel[] | undefined,
  selectedProvider: string | null,
  search: string,
  enabledProviders: EnabledProvidersMap | undefined
): LanguageModel[] => {
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
    // Ensure disabled providers never appear in search
    list = list.filter((m) => enabledProviders?.[m.provider || ""] !== false);
    // Token-based fallback matching to handle cases like "deepseek 8" → "DeepSeek-...-8B"
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    const makeIndexText = (m: LanguageModel) =>
      normalize(`${m.name || ""} ${m.id || ""} ${m.provider || ""}`);
    const tokens = normalize(term).split(/\s+/).filter(Boolean);

    const tokenMatches = list.filter((m) => {
      const text = makeIndexText(m);
      return tokens.every((t) => text.includes(t));
    });

    // Fuse for fuzzy ranking and typos; looser threshold for better recall
    const fuse = new Fuse(list, {
      keys: ["name", "id", "provider"],
      threshold: 0.3,
      ignoreLocation: true,
      distance: 1000,
      minMatchCharLength: 1
    });
    const fuseItems = fuse.search(term).map((r) => r.item);

    // Merge token matches and fuse results (preserve order, de-dupe)
    const merged: LanguageModel[] = [...tokenMatches];
    for (const it of fuseItems) {
      if (!merged.includes(it)) merged.push(it);
    }
    return merged;
  }
  return list;
};

/** Convenience hook to compute all model menu derived data in one place. */
export const useModelMenuData = (models?: LanguageModel[]) => {
  const secrets = useRemoteSettingsStore((s) => s.secrets);
  const enabledProviders = useModelPreferencesStore((s) => s.enabledProviders);
  const favoritesSet = useModelPreferencesStore((s) => s.favorites);
  const recentsList = useModelPreferencesStore((s) => s.recents);
  const search = useModelMenuStore((s) => s.search);
  const selectedProvider = useModelMenuStore((s) => s.selectedProvider);

  const providers = React.useMemo(
    () => computeProvidersList(models, secrets),
    [models, secrets]
  );

  const filteredModels = React.useMemo(
    () => filterModelsList(models, selectedProvider, search, enabledProviders),
    [models, selectedProvider, search, enabledProviders]
  );

  const recentModels = React.useMemo(() => {
    const byKey = new Map<string, LanguageModel>(
      (models ?? []).map((m) => [`${m.provider ?? ""}:${m.id ?? ""}`, m])
    );
    const mapped: LanguageModel[] = [];
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

const useModelMenuStore = create<ModelMenuState>((set) => ({
  search: "",
  selectedProvider: null,
  activeSidebarTab: "favorites",
  models: [],

  setSearch: (value: string) => set({ search: value }),
  setSelectedProvider: (provider: string | null) =>
    set({ selectedProvider: provider }),
  setActiveSidebarTab: (tab: SidebarTab) => set({ activeSidebarTab: tab }),
  setAllModels: (models: LanguageModel[]) => set({ models: models })
}));

export default useModelMenuStore;

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
  allModels: LanguageModel[];

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
  return null;
};

export const ALWAYS_INCLUDE_PROVIDERS = [
  "openai",
  "anthropic",
  "gemini",
  "replicate",
  "ollama",
  "aime"
];

const keyForModel = (m: LanguageModel): string =>
  `${m.provider || ""}:${m.id || ""}`;

export const mergeModelsWithFallback = (
  models?: LanguageModel[]
): LanguageModel[] => {
  const base = [...(models ?? [])];
  const hasGeminiOrGoogle = base.some((m) =>
    /gemini|google/i.test(m.provider || "")
  );
  if (!hasGeminiOrGoogle) {
    const fallbackGemini: LanguageModel[] = [
      {
        type: "language_model",
        provider: "gemini",
        id: "gemini-1.5-pro",
        name: "Gemini 1.5 Pro"
      },
      {
        type: "language_model",
        provider: "gemini",
        id: "gemini-1.5-flash",
        name: "Gemini 1.5 Flash"
      },
      {
        type: "language_model",
        provider: "gemini",
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash"
      }
    ];
    base.push(...fallbackGemini);
  }
  const seen = new Set<string>();
  const deduped: LanguageModel[] = [];
  for (const m of base) {
    const key = keyForModel(m);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(m);
    }
  }
  return deduped;
};

export const computeProvidersList = (
  models: LanguageModel[] | undefined,
  secrets: Record<string, string> | undefined
): string[] => {
  const rawProviders = (models ?? []).map((m) => m.provider || "Other");
  const counts = rawProviders.reduce<Record<string, number>>((acc, p) => {
    acc[p] = (acc[p] || 0) + 1;
    return acc;
  }, {});
  const raw = Array.from(new Set(rawProviders));
  const hasGeminiOrGoogle = raw.some((p) => /gemini|google/i.test(p));
  const geminiEnabled = Boolean(
    secrets?.GEMINI_API_KEY && String(secrets?.GEMINI_API_KEY).trim().length > 0
  );
  const baseList = raw
    .filter((p) => !/gemini|google/i.test(p))
    .concat(hasGeminiOrGoogle || geminiEnabled ? ["gemini"] : [])
    .sort((a, b) => a.localeCompare(b));
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
    const fuse = new Fuse(list, {
      keys: ["name", "id", "provider"],
      threshold: 0.15,
      ignoreLocation: true
    });
    const result = fuse.search(term).map((r) => r.item);
    console.log("[ModelMenu] filter search", { term, count: result.length });
    return result;
  }
  console.log("[ModelMenu] filter", { selectedProvider, total: list.length });
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

  const allModels = React.useMemo(
    () => mergeModelsWithFallback(models),
    [models]
  );

  const providers = React.useMemo(
    () => computeProvidersList(allModels, secrets),
    [allModels, secrets]
  );

  const filteredModels = React.useMemo(
    () =>
      filterModelsList(allModels, selectedProvider, search, enabledProviders),
    [allModels, selectedProvider, search, enabledProviders]
  );

  const recentModels = React.useMemo(() => {
    const byKey = new Map<string, LanguageModel>(
      (allModels ?? []).map((m) => [`${m.provider ?? ""}:${m.id ?? ""}`, m])
    );
    const mapped: LanguageModel[] = [];
    recentsList.forEach((r) => {
      const m = byKey.get(`${r.provider}:${r.id}`);
      if (m) mapped.push(m);
    });
    return mapped;
  }, [allModels, recentsList]);

  const favoriteModels = React.useMemo(() => {
    const keyHas = (provider?: string, id?: string) =>
      favoritesSet.has(`${provider ?? ""}:${id ?? ""}`);
    return (allModels ?? []).filter((m) => keyHas(m.provider, m.id));
  }, [allModels, favoritesSet]);

  const totalCount = allModels.length;
  const filteredCount = filteredModels.length;
  const totalActiveCount = React.useMemo(() => {
    const isEnabled = (p?: string) => enabledProviders?.[p || ""] !== false;
    const isEnvOk = (p?: string) => {
      const env = requiredSecretForProvider(p);
      if (!env) return true;
      const v = secrets?.[env];
      return Boolean(v && String(v).trim().length > 0);
    };
    return allModels.filter((m) => isEnabled(m.provider) && isEnvOk(m.provider))
      .length;
  }, [allModels, enabledProviders, secrets]);

  return {
    allModels,
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
  allModels: [],

  setSearch: (value: string) => set({ search: value }),
  setSelectedProvider: (provider: string | null) =>
    set({ selectedProvider: provider }),
  setActiveSidebarTab: (tab: SidebarTab) => set({ activeSidebarTab: tab }),
  setAllModels: (models: LanguageModel[]) => set({ allModels: models })
}));

export default useModelMenuStore;

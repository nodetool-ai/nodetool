/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo, useState, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Divider
} from "@mui/material";
import type { LanguageModel } from "../../stores/ApiTypes";
import ProviderList from "./ProviderList";
import ModelList from "./ModelList";
import ModelMenuFooter from "./ModelMenuFooter";
import RecentList from "./RecentList";
import FavoritesList from "./FavoritesList";
// import ModelInfoPane from "./ModelInfoPane";
import SearchInput from "../search/SearchInput";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import Fuse from "fuse.js";

export interface ModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  models?: LanguageModel[];
  isLoading?: boolean;
  isError?: boolean;
  onModelChange?: (model: LanguageModel) => void;
}

const containerStyles = css({
  display: "grid",
  gridTemplateColumns: "300px 300px 280px",
  gap: 4,
  minHeight: 480
});

const ModelMenuDialog: React.FC<ModelMenuDialogProps> = ({
  open,
  onClose,
  models,
  isLoading,
  isError,
  onModelChange
}) => {
  const [search, setSearch] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<LanguageModel | null>(
    null
  );
  const secrets = useRemoteSettingsStore((s) => s.secrets);
  const favoritesSet = useModelPreferencesStore((s) => s.favorites);
  const recentsList = useModelPreferencesStore((s) => s.recents);
  const enabledProviders = useModelPreferencesStore((s) => s.enabledProviders);

  // Merge server models with fallback entries for providers we always want to show
  const allModels = useMemo(() => {
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
    // Dedupe by provider:id
    const seen = new Set<string>();
    const deduped: LanguageModel[] = [];
    for (const m of base) {
      const key = `${m.provider || ""}:${m.id || ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(m);
      }
    }
    return deduped;
  }, [models]);

  const providers = useMemo(() => {
    const rawProviders = (allModels ?? []).map((m) => m.provider || "Other");
    const counts = rawProviders.reduce<Record<string, number>>((acc, p) => {
      acc[p] = (acc[p] || 0) + 1;
      return acc;
    }, {});
    const raw = Array.from(new Set(rawProviders));
    const hasGeminiOrGoogle = raw.some((p) => /gemini|google/i.test(p));
    const geminiEnabled = Boolean(
      secrets?.GEMINI_API_KEY &&
        String(secrets?.GEMINI_API_KEY).trim().length > 0
    );
    // Coalesce Google/Gemini under a single "gemini" entry if present
    const baseList = raw
      .filter((p) => !/gemini|google/i.test(p))
      .concat(hasGeminiOrGoogle || geminiEnabled ? ["gemini"] : [])
      .sort((a, b) => a.localeCompare(b));
    // Always include core providers even if no models are returned yet (these will appear greyed out)
    const ALWAYS_INCLUDE_PROVIDERS = [
      "openai",
      "anthropic",
      "gemini",
      "replicate",
      "ollama",
      "aime"
    ];
    const list = Array.from(
      new Set([...baseList, ...ALWAYS_INCLUDE_PROVIDERS])
    ).sort((a, b) => a.localeCompare(b));
    console.log("[ModelMenu] providers computed", {
      rawProviders,
      counts,
      uniqueRaw: raw,
      hasGeminiOrGoogle,
      geminiEnabled,
      alwaysIncluded: ALWAYS_INCLUDE_PROVIDERS,
      finalList: list
    });
    return list;
  }, [allModels, secrets]);

  const requiredSecretForProvider = useCallback(
    (provider?: string): string | null => {
      const p = (provider || "").toLowerCase();
      if (p.includes("openai")) return "OPENAI_API_KEY";
      if (p.includes("anthropic")) return "ANTHROPIC_API_KEY";
      if (p.includes("gemini") || p.includes("google")) return "GEMINI_API_KEY";
      if (p.includes("replicate")) return "REPLICATE_API_TOKEN";
      if (p.includes("aime")) return "AIME_API_KEY";
      // If a provider does not require a key or is local (e.g., ollama, huggingface proxy), return null
      return null;
    },
    []
  );

  const isAvailable = useCallback(
    (provider?: string) => {
      const env = requiredSecretForProvider(provider);
      if (!env) return true;
      const value = secrets?.[env];
      return Boolean(value && String(value).trim().length > 0);
    },
    [requiredSecretForProvider, secrets]
  );

  const filteredModels = useMemo(() => {
    let list = allModels ?? [];
    if (selectedProvider) {
      // Treat Google and Gemini as synonyms for filtering
      if (/gemini|google/i.test(selectedProvider)) {
        list = list.filter((m) => /gemini|google/i.test(m.provider || ""));
      } else {
        list = list.filter((m) => m.provider === selectedProvider);
      }
    }
    // If viewing "All providers", exclude models from disabled providers
    if (!selectedProvider) {
      list = list.filter((m) => enabledProviders?.[m.provider || ""] !== false);
    }
    // Do not hide models based on missing API keys here; we already gray + hint in UI
    const term = search.trim();
    if (term.length > 0) {
      const fuse = new Fuse(list, {
        keys: ["name", "id", "provider"],
        threshold: 0.35,
        ignoreLocation: true
      });
      const result = fuse.search(term).map((r) => r.item);
      console.log("[ModelMenu] filter search", { term, count: result.length });
      return result;
    }
    console.log("[ModelMenu] filter", { selectedProvider, total: list.length });
    return list;
  }, [allModels, selectedProvider, search, enabledProviders]);

  const recentModels = useMemo(() => {
    const recents = recentsList;
    const byKey = new Map<string, LanguageModel>(
      (allModels ?? []).map((m) => [`${m.provider ?? ""}:${m.id ?? ""}`, m])
    );
    const mapped: LanguageModel[] = [];
    recents.forEach((r) => {
      const m = byKey.get(`${r.provider}:${r.id}`);
      if (m) mapped.push(m);
    });
    // Do not filter recents by enabled providers; show them all
    return mapped;
  }, [allModels, recentsList]);

  const favoriteModels = useMemo(() => {
    const keyHas = (provider?: string, id?: string) =>
      favoritesSet.has(`${provider ?? ""}:${id ?? ""}`);
    const list = (allModels ?? []).filter((m) => keyHas(m.provider, m.id));
    return list;
  }, [allModels, favoritesSet]);

  const handleSelectModel = useCallback(
    (m: LanguageModel) => {
      setSelectedModel(m);
      onModelChange?.(m);

      console.log("[ModelMenu] select model", {
        provider: m.provider,
        id: m.id
      });
    },
    [onModelChange]
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      className="model-menu__dialog"
      PaperProps={{
        sx: {
          backgroundImage: "none",
          backgroundColor: (theme) => theme.vars.palette.background.paper
        }
      }}
    >
      <DialogTitle
        sx={{ fontSize: "1rem", letterSpacing: 0.4 }}
        className="model-menu__title"
      >
        Select Model
      </DialogTitle>
      <DialogContent dividers>
        <Box
          sx={{ mb: 1, display: "flex", gap: 2, alignItems: "center" }}
          className="model-menu__controls"
        >
          <Box sx={{ flex: 1 }}>
            <SearchInput
              onSearchChange={(v) => {
                console.log("[ModelMenu] search", v);
                setSearch(v);
              }}
              placeholder="Search models..."
              debounceTime={150}
              focusSearchInput
              focusOnTyping
              maxWidth="300px"
              width={300}
            />
          </Box>
        </Box>
        <div css={containerStyles} className="model-menu__grid">
          <ProviderList
            providers={providers}
            selected={selectedProvider}
            onSelect={setSelectedProvider}
            isLoading={!!isLoading}
            isError={!!isError}
          />
          <Box
            className="model-menu__model-list-container"
            sx={{ maxWidth: 300, overflowX: "hidden" }}
          >
            <ModelList models={filteredModels} onSelect={handleSelectModel} />
          </Box>
          <Box
            className="model-menu__sidebar"
            sx={{ overflowY: "auto", maxHeight: 520 }}
          >
            <FavoritesList
              models={favoriteModels}
              onSelect={handleSelectModel}
            />
            <Divider sx={{ my: 1 }} />
            <RecentList models={recentModels} onSelect={handleSelectModel} />
          </Box>
          <ModelMenuFooter
            filteredCount={filteredModels.length}
            totalCount={(allModels ?? []).length}
            totalActiveCount={(() => {
              const all = allModels ?? [];
              const isEnabled = (p?: string) =>
                enabledProviders?.[p || ""] !== false;
              const isEnvOk = (p?: string) => {
                const env = requiredSecretForProvider(p);
                if (!env) return true;
                const v = secrets?.[env];
                return Boolean(v && String(v).trim().length > 0);
              };
              return all.filter(
                (m) => isEnabled(m.provider) && isEnvOk(m.provider)
              ).length;
            })()}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ModelMenuDialog;

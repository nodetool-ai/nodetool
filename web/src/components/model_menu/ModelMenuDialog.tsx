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

  const providers = useMemo(() => {
    const set = new Set<string>();
    (models ?? []).forEach((m) => set.add(m.provider || "Other"));
    const list = Array.from(set).sort((a, b) => a.localeCompare(b));
    if (
      !list.includes("gemini") &&
      (models ?? []).some((m) => /gemini|google/i.test(m.provider || ""))
    ) {
      console.log(
        "[ModelMenu] providers computed; note: gemini not present but models contain google/gemini variants",
        list
      );
    } else {
      console.log("[ModelMenu] providers computed", list);
    }
    return list;
  }, [models]);

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
    let list = models ?? [];
    if (selectedProvider) {
      list = list.filter((m) => m.provider === selectedProvider);
    }
    // Filter out disabled providers
    list = list.filter((m) => enabledProviders?.[m.provider || ""] !== false);
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
    console.log("[ModelMenu] filter", {
      selectedProvider,
      total: list.length
    });
    return list;
  }, [models, selectedProvider, search, enabledProviders]);

  const recentModels = useMemo(() => {
    const recents = recentsList;
    const byKey = new Map<string, LanguageModel>(
      (models ?? []).map((m) => [`${m.provider ?? ""}:${m.id ?? ""}`, m])
    );
    const mapped: LanguageModel[] = [];
    recents.forEach((r) => {
      const m = byKey.get(`${r.provider}:${r.id}`);
      if (m) mapped.push(m);
    });
    const enabledFiltered = mapped.filter(
      (m) => enabledProviders?.[m.provider || ""] !== false
    );
    return enabledFiltered;
  }, [models, recentsList, enabledProviders]);

  const favoriteModels = useMemo(() => {
    const keyHas = (provider?: string, id?: string) =>
      favoritesSet.has(`${provider ?? ""}:${id ?? ""}`);
    const list = (models ?? []).filter(
      (m) =>
        keyHas(m.provider, m.id) &&
        enabledProviders?.[m.provider || ""] !== false
    );
    return list;
  }, [models, favoritesSet, enabledProviders]);

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
    >
      <DialogTitle
        sx={{ fontSize: (theme) => theme.fontSizeBig, letterSpacing: 0.4 }}
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
        <div
          css={containerStyles}
          className="model-menu__grid"
          style={{ position: "relative" }}
        >
          <ProviderList
            providers={providers}
            selected={selectedProvider}
            onSelect={setSelectedProvider}
            isLoading={!!isLoading}
            isError={!!isError}
          />
          <Box
            className="model-menu__model-list-container"
            sx={{ maxWidth: 300 }}
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
          <Box
            sx={{
              position: "absolute",
              right: 8,
              bottom: 8,
              opacity: 0.7,
              fontSize: (theme) => theme.fontSizeSmaller
            }}
            className="model-menu__footer-counts"
          >
            {`${filteredModels.length} / ${(models ?? []).length}`}
          </Box>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ModelMenuDialog;

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo, useState, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  FormControlLabel,
  Switch,
  Divider
} from "@mui/material";
import type { LanguageModel } from "../../stores/ApiTypes";
import ProviderList from "./ProviderList";
import ModelList from "./ModelList";
import RecentList from "./RecentList";
import FavoritesList from "./FavoritesList";
import ModelInfoPane from "./ModelInfoPane";
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
  gridTemplateColumns: "260px 1fr 360px",
  gap: 12,
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
  const onlyAvailable = useModelPreferencesStore((s) => s.onlyAvailable);
  const setOnlyAvailable = useModelPreferencesStore((s) => s.setOnlyAvailable);
  const favoritesSet = useModelPreferencesStore((s) => s.favorites);
  const recentsList = useModelPreferencesStore((s) => s.recents);

  const providers = useMemo(() => {
    const set = new Set<string>();
    (models ?? []).forEach((m) => set.add(m.provider || "Other"));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
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
    if (onlyAvailable) {
      list = list.filter((m) => isAvailable(m.provider));
    }
    const term = search.trim();
    if (term.length > 0) {
      const fuse = new Fuse(list, {
        keys: ["name", "id", "provider"],
        threshold: 0.35,
        ignoreLocation: true
      });
      return fuse.search(term).map((r) => r.item);
    }
    return list;
  }, [models, selectedProvider, search, onlyAvailable, isAvailable]);

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
    return onlyAvailable
      ? mapped.filter((m) => isAvailable(m.provider))
      : mapped;
  }, [models, onlyAvailable, isAvailable, recentsList]);

  const favoriteModels = useMemo(() => {
    const keyHas = (provider?: string, id?: string) =>
      favoritesSet.has(`${provider ?? ""}:${id ?? ""}`);
    const list = (models ?? []).filter((m) => keyHas(m.provider, m.id));
    return onlyAvailable ? list.filter((m) => isAvailable(m.provider)) : list;
  }, [models, onlyAvailable, isAvailable, favoritesSet]);

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
      maxWidth="lg"
      className="model-menu__dialog"
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
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={onlyAvailable}
                onChange={(e) => setOnlyAvailable(e.target.checked)}
              />
            }
            label="Only available"
          />
        </Box>
        <div css={containerStyles} className="model-menu__grid">
          <ProviderList
            providers={providers}
            selected={selectedProvider}
            onSelect={setSelectedProvider}
            isLoading={!!isLoading}
            isError={!!isError}
          />
          <Box>
            {search.trim().length === 0 && !selectedProvider && (
              <>
                <FavoritesList
                  models={favoriteModels}
                  onSelect={handleSelectModel}
                />
                <Divider sx={{ my: 1 }} />
                <RecentList
                  models={recentModels}
                  onSelect={handleSelectModel}
                />
                <Divider sx={{ my: 1 }} />
              </>
            )}
            <ModelList models={filteredModels} onSelect={handleSelectModel} />
          </Box>
          <ModelInfoPane model={selectedModel} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ModelMenuDialog;

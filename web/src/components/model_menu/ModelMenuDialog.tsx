/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo, useState, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  FormControlLabel,
  Switch
} from "@mui/material";
import type { LanguageModel } from "../../stores/ApiTypes";
import ProviderList from "./ProviderList";
import ModelList from "./ModelList";
import ModelInfoPane from "./ModelInfoPane";
import SearchBar from "./SearchBar";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";

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
  gridTemplateColumns: "240px 1fr 320px",
  gap: 12,
  minHeight: 420
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
    if (search.trim().length > 0) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          (m.name || "").toLowerCase().includes(q) ||
          (m.id || "").toLowerCase().includes(q) ||
          (m.provider || "").toLowerCase().includes(q)
      );
    }
    if (onlyAvailable) {
      list = list.filter((m) => isAvailable(m.provider));
    }
    return list;
  }, [models, selectedProvider, search, onlyAvailable, isAvailable]);

  const handleSelectModel = useCallback(
    (m: LanguageModel) => {
      setSelectedModel(m);
      onModelChange?.(m);
      // eslint-disable-next-line no-console
      console.log("[ModelMenu] select model", {
        provider: m.provider,
        id: m.id
      });
    },
    [onModelChange]
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Select Model</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ mb: 1, display: "flex", gap: 2, alignItems: "center" }}>
          <Box sx={{ flex: 1 }}>
            <SearchBar value={search} onChange={setSearch} />
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
        <div css={containerStyles}>
          <ProviderList
            providers={providers}
            selected={selectedProvider}
            onSelect={setSelectedProvider}
            isLoading={!!isLoading}
            isError={!!isError}
          />
          <ModelList models={filteredModels} onSelect={handleSelectModel} />
          <ModelInfoPane model={selectedModel} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ModelMenuDialog;

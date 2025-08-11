/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo, useState, useCallback } from "react";
import { Dialog, DialogTitle, DialogContent, Box } from "@mui/material";
import type { LanguageModel } from "../../stores/ApiTypes";
import ProviderList from "./ProviderList";
import ModelList from "./ModelList";
import ModelInfoPane from "./ModelInfoPane";
import SearchBar from "./SearchBar";

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

  const providers = useMemo(() => {
    const set = new Set<string>();
    (models ?? []).forEach((m) => set.add(m.provider || "Other"));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [models]);

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
    return list;
  }, [models, selectedProvider, search]);

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
        <Box sx={{ mb: 1 }}>
          <SearchBar value={search} onChange={setSearch} />
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

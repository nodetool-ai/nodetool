import React, { useState, useCallback, useMemo, useRef } from "react";
import { Typography, Tooltip, Button } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import { isEqual } from "lodash";
import useModelStore from "../../stores/ModelStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import {
  isHuggingFaceProvider,
  getProviderBaseName,
  formatGenericProviderName
} from "../../utils/providerDisplay";
import ModelMenuDialog from "../model_menu/ModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { LanguageModel } from "../../stores/ApiTypes";

interface LanguageModelSelectProps {
  onChange: (value: any) => void;
  value: string;
}

interface GroupedModels {
  [provider: string]: Array<{
    id: string;
    name: string;
    provider: string;
  }>;
}

const HFBadge: React.FC = () => (
  <span
    style={{
      marginLeft: 6,
      padding: "1px 4px",
      fontSize: "0.7em",
      lineHeight: 1,
      borderRadius: 3,
      background: "var(--palette-grey-600)",
      color: "var(--palette-grey-0)",
      letterSpacing: 0.3
    }}
  >
    HF
  </span>
);

const renderProviderLabel = (provider: string): React.ReactNode => {
  if (isHuggingFaceProvider(provider)) {
    const base = getProviderBaseName(provider);
    return (
      <span>
        {base}
        <HFBadge />
      </span>
    );
  }
  return formatGenericProviderName(provider);
};

const LanguageModelSelect: React.FC<LanguageModelSelectProps> = ({
  onChange,
  value
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);
  const theme = useTheme();

  const loadLanguageModels = useModelStore((state) => state.loadLanguageModels);
  const {
    data: models,
    isLoading,
    isError
  } = useQuery({
    queryKey: ["models"],
    queryFn: async () => await loadLanguageModels()
  });

  const sortedModels = useMemo(() => {
    if (!models || isLoading || isError) return [];
    return models.sort((a, b) => a.name.localeCompare(b.name));
  }, [models, isLoading, isError]);

  const groupedModels = useMemo(() => {
    if (!sortedModels || isLoading || isError) return {};
    return sortedModels.reduce<GroupedModels>((acc, model) => {
      const provider = model.provider || "Other";
      if (!acc[provider]) {
        acc[provider] = [];
      }
      acc[provider].push({
        id: model.id || "",
        name: model.name || "",
        provider
      });
      return acc;
    }, {});
  }, [sortedModels, isLoading, isError]);

  const currentSelectedModelDetails = useMemo(() => {
    if (!models || !value) return null;
    return models.find((m) => m.id === value);
  }, [models, value]);

  const handleClick = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const handleDialogModelSelect = useCallback(
    (model: LanguageModel) => {
      const modelToPass = {
        type: "language_model" as const,
        id: model.id,
        provider: model.provider,
        name: model.name || ""
      };
      onChange(modelToPass);
      addRecent({
        provider: model.provider || "",
        id: model.id || "",
        name: model.name || ""
      });
      setDialogOpen(false);
    },
    [onChange, addRecent]
  );

  const sortedProviders = useMemo(
    () =>
      Object.keys(groupedModels).sort((a, b) => {
        const aKey = (
          isHuggingFaceProvider(a)
            ? getProviderBaseName(a)
            : formatGenericProviderName(a)
        ).toLowerCase();
        const bKey = (
          isHuggingFaceProvider(b)
            ? getProviderBaseName(b)
            : formatGenericProviderName(b)
        ).toLowerCase();
        return aKey.localeCompare(bKey);
      }),
    [groupedModels]
  );

  return (
    <>
      <Tooltip
        title={
          <div style={{ textAlign: "center" }}>
            <Typography variant="inherit">
              {currentSelectedModelDetails?.name || value || "Select a model"}
            </Typography>
            <Typography variant="caption" display="block">
              Select Model
            </Typography>
          </div>
        }
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <Button
          ref={buttonRef}
          className={`select-model-button language-model-button ${
            value ? "active" : ""
          }`}
          sx={{
            fontSize: "var(--fontSizeTiny)",
            border: "1px solid transparent",
            borderRadius: "0.25em",
            color: "var(--palette-grey-0)",
            textTransform: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            height: "18px",
            minHeight: 0,
            padding: "0 0.5em !important",
            "&:hover": {
              backgroundColor: "var(--palette-grey-500)"
            }
          }}
          onClick={handleClick}
          size="small"
        >
          <Typography
            variant="body2"
            sx={{
              color: "var(--palette-grey-200)",
              lineHeight: 1,
              display: "block"
            }}
          >
            {currentSelectedModelDetails?.name || value || "Select Model"}
          </Typography>
        </Button>
      </Tooltip>
      <ModelMenuDialog
        open={dialogOpen}
        onClose={handleClose}
        models={models}
        isLoading={isLoading}
        isError={isError}
        onModelChange={handleDialogModelSelect}
      />
    </>
  );
};

export default React.memo(LanguageModelSelect, isEqual);

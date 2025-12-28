import React, { useState, useCallback, useMemo, useRef } from "react";
import isEqual from "lodash/isEqual";
import ASRModelMenuDialog from "../model_menu/ASRModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { ASRModel } from "../../stores/ApiTypes";
import { client } from "../../stores/ApiClient";
import { useQuery } from "@tanstack/react-query";
import ModelSelectButton from "./shared/ModelSelectButton";

interface ASRModelSelectProps {
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

const ASRModelSelect: React.FC<ASRModelSelectProps> = ({
  onChange,
  value
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);
  const theme = useTheme();

  const loadASRModels = useCallback(async () => {
    const { data, error } = await client.GET("/api/models/{model_type}" as any, {
      params: { path: { model_type: "asr" } }
    });
    if (error) {
      throw error;
    }
    return data as unknown as ASRModel[];
  }, []);

  const {
    data: models,
    isLoading,
    isError
  } = useQuery({
    queryKey: ["asr-models"],
    queryFn: async () => await loadASRModels()
  });

  const sortedModels = useMemo(() => {
    if (!models || isLoading || isError) {return [];}
    return models.sort((a: ASRModel, b: ASRModel) => a.name.localeCompare(b.name));
  }, [models, isLoading, isError]);

  const groupedModels = useMemo(() => {
    if (!sortedModels || isLoading || isError) {return {};}
    return sortedModels.reduce<GroupedModels>((acc, model: ASRModel) => {
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
    if (!models || !value) {return null;}
    return models.find((m) => m.id === value);
  }, [models, value]);

  const handleClick = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const handleDialogModelSelect = useCallback(
    (model: ASRModel) => {
      const modelToPass = {
        type: "asr_model" as const,
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
      <ModelSelectButton
        ref={buttonRef}
        className="asr-model-button"
        active={!!value}
        label={currentSelectedModelDetails?.name || value || "Select Model"}
        subLabel="Select ASR Model"
        onClick={handleClick}
      />
      <ASRModelMenuDialog
        open={dialogOpen}
        onClose={handleClose}
        onModelChange={handleDialogModelSelect}
      />
    </>
  );
};

export default React.memo(ASRModelSelect, isEqual);

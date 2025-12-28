import React, { useState, useCallback, useMemo, useRef } from "react";
import isEqual from "lodash/isEqual";
import { useTheme } from "@mui/material/styles";
import TTSModelMenuDialog from "../model_menu/TTSModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { TTSModel } from "../../stores/ApiTypes";
import { client } from "../../stores/ApiClient";
import Select from "../inputs/Select";
import { useQuery } from "@tanstack/react-query";
import ModelSelectButton from "./shared/ModelSelectButton";
import {
  isHuggingFaceProvider,
  getProviderBaseName,
  formatGenericProviderName
} from "../../utils/providerDisplay";

interface TTSModelSelectProps {
  onChange: (value: any) => void;
  value: any; // Can be string (legacy) or TTSModel object
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

const TTSModelSelect: React.FC<TTSModelSelectProps> = ({
  onChange,
  value
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);
  const theme = useTheme();

  const loadTTSModels = useCallback(async () => {
    const { data, error } = await client.GET("/api/models/{model_type}" as any, {
      params: { path: { model_type: "tts" } }
    });
    if (error) {
      throw error;
    }
    return data as unknown as TTSModel[];
  }, []);

  const {
    data: models,
    isLoading,
    isError
  } = useQuery({
    queryKey: ["tts-models"],
    queryFn: async () => await loadTTSModels()
  });

  const sortedModels = useMemo(() => {
    if (!models || isLoading || isError) {return [];}
    return models.sort((a: TTSModel, b: TTSModel) => a.name.localeCompare(b.name));
  }, [models, isLoading, isError]);

  const groupedModels = useMemo(() => {
    if (!sortedModels || isLoading || isError) {return {};}
    return sortedModels.reduce<GroupedModels>((acc, model: TTSModel) => {
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

  // Extract model ID from value (can be string or TTSModel object)
  const modelId = useMemo(() => {
    if (typeof value === 'string') {return value;}
    return value?.id || '';
  }, [value]);

  const currentSelectedModelDetails = useMemo(() => {
    if (!models || !modelId) {return null;}
    return models.find((m) => m.id === modelId);
  }, [models, modelId]);

  // Get selected voice from value object
  const selectedVoice = useMemo(() => {
    if (typeof value === 'object' && value?.selected_voice) {
      return value.selected_voice;
    }
    return '';
  }, [value]);

  const handleClick = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const handleDialogModelSelect = useCallback(
    (model: TTSModel) => {
      const modelToPass = {
        type: "tts_model" as const,
        id: model.id,
        provider: model.provider,
        name: model.name || "",
        voices: model.voices || [],
        selected_voice: model.voices && model.voices.length > 0 ? model.voices[0] : ""
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

  const handleVoiceChange = useCallback(
    (newVoice: string) => {
      const modelToPass = {
        type: "tts_model" as const,
        id: modelId,
        provider: currentSelectedModelDetails?.provider || "empty",
        name: currentSelectedModelDetails?.name || "",
        voices: currentSelectedModelDetails?.voices || [],
        selected_voice: newVoice
      };
      onChange(modelToPass);
    },
    [onChange, modelId, currentSelectedModelDetails]
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

  const hasVoices = currentSelectedModelDetails?.voices && currentSelectedModelDetails.voices.length > 0;

  const voiceOptions = useMemo(() => {
    if (!currentSelectedModelDetails?.voices) {return [];}
    return currentSelectedModelDetails.voices.map((voice) => ({
      value: voice,
      label: voice
    }));
  }, [currentSelectedModelDetails?.voices]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <ModelSelectButton
        ref={buttonRef}
        className="tts-model-button"
        active={!!modelId}
        label={currentSelectedModelDetails?.name || modelId || "Select TTS Model"}
        subLabel="Select Text-to-Speech Model"
        onClick={handleClick}
      />

      {hasVoices && (
        <Select
          options={voiceOptions}
          value={selectedVoice || (currentSelectedModelDetails?.voices?.[0] || '')}
          onChange={handleVoiceChange}
          placeholder="Select voice"
          label="Voice"
        />
      )}

      <TTSModelMenuDialog
        open={dialogOpen}
        onClose={handleClose}
        onModelChange={handleDialogModelSelect}
      />
    </div>
  );
};

export default React.memo(TTSModelSelect, isEqual);

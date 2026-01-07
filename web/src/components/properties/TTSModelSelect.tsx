import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import isEqual from "lodash/isEqual";
import TTSModelMenuDialog from "../model_menu/TTSModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { TTSModel } from "../../stores/ApiTypes";
import Select from "../inputs/Select";
import ModelSelectButton from "./shared/ModelSelectButton";
import { useTTSModelsByProvider } from "../../hooks/useModelsByProvider";

interface TTSModelSelectProps {
  onChange: (value: any) => void;
  value: any; // Can be string (legacy) or TTSModel object
}

const TTSModelSelect: React.FC<TTSModelSelectProps> = ({ onChange, value }) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);
  const getDefaultModel = useModelPreferencesStore((s) => s.getDefaultModel);

  const { models, isLoading } = useTTSModelsByProvider();

  // Extract model ID from value (can be string or TTSModel object)
  const modelId = useMemo(() => {
    if (typeof value === "string") {
      return value;
    }
    return value?.id || "";
  }, [value]);

  const currentSelectedModelDetails = useMemo(() => {
    if (!models || !modelId) {
      return null;
    }
    return models.find((m) => m.id === modelId);
  }, [models, modelId]);

  // Automatically fall back to default model if current model is not found
  useEffect(() => {
    // Only check once models are loaded and we have a value set
    if (isLoading || !models || models.length === 0) {
      return;
    }
    
    // If no value is set or model exists, don't do anything
    if (!modelId || currentSelectedModelDetails) {
      return;
    }

    // Model not found in the list, try to fall back to default
    const defaultModel = getDefaultModel("tts_model");
    if (defaultModel) {
      // Check if the default model exists in the available models
      const defaultModelDetails = models.find((m) => m.id === defaultModel.id);
      if (defaultModelDetails) {
        const modelToPass = {
          type: "tts_model" as const,
          id: defaultModel.id,
          provider: defaultModel.provider,
          name: defaultModel.name,
          voices: defaultModelDetails.voices || [],
          selected_voice:
            defaultModelDetails.voices && defaultModelDetails.voices.length > 0
              ? defaultModelDetails.voices[0]
              : ""
        };
        onChange(modelToPass);
      }
    }
  }, [modelId, models, isLoading, currentSelectedModelDetails, getDefaultModel, onChange]);

  // Get selected voice from value object
  const selectedVoice = useMemo(() => {
    if (typeof value === "object" && value?.selected_voice) {
      return value.selected_voice;
    }
    return "";
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
        selected_voice:
          model.voices && model.voices.length > 0 ? model.voices[0] : ""
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
  const hasVoices =
    currentSelectedModelDetails?.voices &&
    currentSelectedModelDetails.voices.length > 0;
  const voiceOptions = useMemo(() => {
    if (!currentSelectedModelDetails?.voices) {
      return [];
    }
    return currentSelectedModelDetails.voices.map((voice) => ({
      value: voice,
      label: voice
    }));
  }, [currentSelectedModelDetails?.voices]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <ModelSelectButton
        ref={buttonRef}
        active={!!modelId}
        label={
          currentSelectedModelDetails?.name || modelId || "Select TTS Model"
        }
        subLabel="Select Text-to-Speech Model"
        onClick={handleClick}
      />

      {hasVoices && (
        <Select
          options={voiceOptions}
          value={
            selectedVoice || currentSelectedModelDetails?.voices?.[0] || ""
          }
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

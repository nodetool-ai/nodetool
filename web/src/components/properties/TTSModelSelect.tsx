import React, { useState, useCallback, useMemo, useRef } from "react";
import isEqual from "lodash/isEqual";
import TTSModelMenuDialog from "../model_menu/TTSModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { TTSModel } from "../../stores/ApiTypes";
import { client } from "../../stores/ApiClient";
import Select from "../inputs/Select";
import { useQuery } from "@tanstack/react-query";
import ModelSelectButton from "./shared/ModelSelectButton";

interface TTSModelSelectProps {
  onChange: (value: TTSModel) => void;
  value: string | TTSModel;
}

const TTSModelSelect: React.FC<TTSModelSelectProps> = ({ onChange, value }) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);
  const loadTTSModels = useCallback(async () => {
    const { data, error } = await client.GET(
      "/api/models/{model_type}" as any,
      {
        params: { path: { model_type: "tts" } }
      }
    );
    if (error) {
      throw error;
    }
    return data as unknown as TTSModel[];
  }, []);

  const { data: models } = useQuery({
    queryKey: ["tts-models"],
    queryFn: async () => await loadTTSModels()
  });

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

  // Get selected voice from value object
  const selectedVoice = useMemo(() => {
    if (typeof value === "object" && value?.selected_voice) {
      return value.selected_voice;
    }
    return "";
  }, [value]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
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
      setAnchorEl(null);
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
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={handleClose}
        onModelChange={handleDialogModelSelect}
      />
    </div>
  );
};

export default React.memo(TTSModelSelect, isEqual);

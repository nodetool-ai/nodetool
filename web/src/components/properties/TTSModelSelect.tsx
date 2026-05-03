import React, { memo, useState, useCallback, useMemo, useRef } from "react";
import isEqual from "fast-deep-equal";
import TTSModelMenuDialog from "../model_menu/TTSModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type {
  ModelPack,
  TTSModel,
  TTSModelValue,
  UnifiedModel
} from "../../stores/ApiTypes";
import { trpc } from "../../lib/trpc";
import Select from "../inputs/Select";
import { useQuery } from "@tanstack/react-query";
import ModelSelectButton from "./shared/ModelSelectButton";

interface TTSModelSelectProps {
  onChange: (value: TTSModelValue) => void;
  value: string | TTSModelValue; // Can be string (legacy) or TTSModelValue object
  recommendedModels?: UnifiedModel[];
  modelPacks?: ModelPack[];
}

const TTSModelSelect: React.FC<TTSModelSelectProps> = ({
  onChange,
  value,
  recommendedModels,
  modelPacks
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);
  const { data: models } = useQuery({
    queryKey: ["tts-models"],
    queryFn: () => trpc.models.tts.query() as Promise<TTSModel[]>
  });

  // Extract model ID from value (can be string or TTSModel object)
  const modelId = useMemo(() => {
    if (typeof value === "string") {
      return value;
    }
    return value?.id || "";
  }, [value]);

  const modelProvider = useMemo(
    () => (typeof value === "object" ? value?.provider ?? "" : ""),
    [value]
  );

  const currentSelectedModelDetails = useMemo(() => {
    if (!models || !modelId) {
      return null;
    }
    // Prefer (provider, id) match — same model id can exist across providers.
    const exact = modelProvider
      ? models.find((m) => m.id === modelId && m.provider === modelProvider)
      : null;
    return exact ?? models.find((m) => m.id === modelId) ?? null;
  }, [models, modelId, modelProvider]);

  // Voices come from the live model list when available, otherwise fall back
  // to the voices stored on the value object (e.g. provider not configured
  // in this session, or the model list hasn't loaded yet).
  const availableVoices = useMemo(() => {
    const live = currentSelectedModelDetails?.voices;
    if (live && live.length > 0) return live;
    if (typeof value === "object" && Array.isArray(value?.voices)) {
      return value.voices;
    }
    return [] as string[];
  }, [currentSelectedModelDetails, value]);

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
      const baseProvider =
        currentSelectedModelDetails?.provider ||
        modelProvider ||
        "empty";
      const baseName =
        currentSelectedModelDetails?.name ||
        (typeof value === "object" ? value?.name ?? "" : "");
      const modelToPass = {
        type: "tts_model" as const,
        id: modelId,
        provider: baseProvider,
        name: baseName,
        voices: availableVoices,
        selected_voice: newVoice
      };
      onChange(modelToPass);
    },
    [
      onChange,
      modelId,
      modelProvider,
      currentSelectedModelDetails,
      availableVoices,
      value
    ]
  );
  const hasVoices = availableVoices.length > 0;
  const voiceOptions = useMemo(
    () => availableVoices.map((voice) => ({ value: voice, label: voice })),
    [availableVoices]
  );

  const containerStyle = useMemo(() => ({
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "4px"
  }), []);

  return (
    <div style={containerStyle}>
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
          value={selectedVoice || availableVoices[0] || ""}
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
        recommendedModels={recommendedModels}
        modelPacks={modelPacks}
      />
    </div>
  );
};

export default memo(TTSModelSelect, isEqual);

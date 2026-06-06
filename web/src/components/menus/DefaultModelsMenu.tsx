import React, { useCallback } from "react";
import { Text, FlexRow, EditorButton } from "../ui_primitives";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import LanguageModelSelect from "../properties/LanguageModelSelect";
import ImageModelSelect from "../properties/ImageModelSelect";
import EmbeddingModelSelect from "../properties/EmbeddingModelSelect";
import TTSModelSelect from "../properties/TTSModelSelect";
import ASRModelSelect from "../properties/ASRModelSelect";
import VideoModelSelect from "../properties/VideoModelSelect";

const MODEL_TYPE_CONFIG = [
  {
    type: "language_model",
    label: "Language Model",
    Select: LanguageModelSelect
  },
  { type: "image_model", label: "Image Model", Select: ImageModelSelect },
  {
    type: "embedding_model",
    label: "Embedding Model",
    Select: EmbeddingModelSelect
  },
  {
    type: "tts_model",
    label: "Text-to-Speech Model",
    Select: TTSModelSelect
  },
  {
    type: "asr_model",
    label: "Speech Recognition Model",
    Select: ASRModelSelect
  },
  { type: "video_model", label: "Video Model", Select: VideoModelSelect }
] as const;

function DefaultModelsMenu() {
  const defaults = useModelPreferencesStore((s) => s.defaults);
  const setDefault = useModelPreferencesStore((s) => s.setDefault);
  const clearDefault = useModelPreferencesStore((s) => s.clearDefault);

  return (
    <div>
      <Text size="big" id="default-models" className="settings-heading">
        Default Models
      </Text>
      <Text className="description" sx={{ mb: 2 }}>
        Set default models for each type. These will auto-fill when you create
        new nodes.
      </Text>

      <div className="default-models-list">
        {MODEL_TYPE_CONFIG.map(({ type, label, Select }) => (
          <DefaultModelRow
            key={type}
            modelType={type}
            label={label}
            Select={Select}
            current={defaults[type]}
            onSelect={setDefault}
            onClear={clearDefault}
          />
        ))}
      </div>
    </div>
  );
}

interface DefaultModelRowProps {
  modelType: string;
  label: string;
  Select: React.ComponentType<{
    onChange: (value: unknown) => void;
    value: string;
  }>;
  current?: { provider: string; id: string; name: string };
  onSelect: (
    modelType: string,
    model: { provider: string; id: string; name: string }
  ) => void;
  onClear: (modelType: string) => void;
}

function DefaultModelRow({
  modelType,
  label,
  Select,
  current,
  onSelect,
  onClear
}: DefaultModelRowProps) {
  const handleChange = useCallback(
    (value: unknown) => {
      const v = value as { provider?: string; id?: string; name?: string };
      if (v?.id) {
        onSelect(modelType, {
          provider: v.provider || "",
          id: v.id,
          name: v.name || ""
        });
      }
    },
    [modelType, onSelect]
  );

  const handleClear = useCallback(() => {
    onClear(modelType);
  }, [modelType, onClear]);

  return (
    <div className="default-model-row" id={`default-model-${modelType}`}>
      <Text weight={600}>{label}</Text>
      <FlexRow align="center" gap={1}>
        <Select onChange={handleChange} value={current?.id || ""} />
        {current && (
          <EditorButton size="small" onClick={handleClear}>
            Clear
          </EditorButton>
        )}
      </FlexRow>
    </div>
  );
}

export default React.memo(DefaultModelsMenu);

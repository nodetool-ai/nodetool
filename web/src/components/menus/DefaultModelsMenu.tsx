import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Text, FlexRow, EditorButton, FormField } from "../ui_primitives";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import LanguageModelSelect from "../properties/LanguageModelSelect";
import ImageModelSelect from "../properties/ImageModelSelect";
import EmbeddingModelSelect from "../properties/EmbeddingModelSelect";
import TTSModelSelect from "../properties/TTSModelSelect";
import ASRModelSelect from "../properties/ASRModelSelect";
import VideoModelSelect from "../properties/VideoModelSelect";
import { CODE_MODEL_PREFERENCE } from "../../hooks/useCodeAuthoringModel";
import type { ImageModelValue } from "../../stores/ApiTypes";
import { IMAGE_TASK_DEFAULTS } from "../../utils/applyDefaultModels";

interface TaskModelSelectProps {
  onChange: (value: ImageModelValue) => void;
  value: string;
}

const UpscaleModelSelect = React.memo(function UpscaleModelSelect(
  props: TaskModelSelectProps
) {
  return <ImageModelSelect {...props} task="upscale" />;
});

const RemoveBackgroundModelSelect = React.memo(
  function RemoveBackgroundModelSelect(props: TaskModelSelectProps) {
    return <ImageModelSelect {...props} task="remove_background" />;
  }
);

const MODEL_TYPE_CONFIG = [
  {
    type: "language_model",
    labelKey: "languageModel",
    Select: LanguageModelSelect
  },
  { type: "image_model", labelKey: "imageModel", Select: ImageModelSelect },
  {
    type: IMAGE_TASK_DEFAULTS["nodetool.image.Upscale"],
    labelKey: "upscaleModel",
    Select: UpscaleModelSelect,
    hintKey: "upscaleHint"
  },
  {
    type: IMAGE_TASK_DEFAULTS["nodetool.image.RemoveBackground"],
    labelKey: "removeBackgroundModel",
    Select: RemoveBackgroundModelSelect,
    hintKey: "removeBackgroundHint"
  },
  {
    type: "embedding_model",
    labelKey: "embeddingModel",
    Select: EmbeddingModelSelect
  },
  {
    type: "tts_model",
    labelKey: "ttsModel",
    Select: TTSModelSelect
  },
  {
    type: "asr_model",
    labelKey: "asrModel",
    Select: ASRModelSelect
  },
  { type: "video_model", labelKey: "videoModel", Select: VideoModelSelect },
  {
    type: CODE_MODEL_PREFERENCE,
    labelKey: "codeGeneration",
    Select: LanguageModelSelect,
    // The submission is a tool call, so non-tool-capable models are hidden.
    selectProps: { placeholderKey: "useChatModel", requireToolSupport: true },
    hintKey: "codeGenerationHint"
  }
] as const;

function DefaultModelsMenu() {
  const { t } = useTranslation();
  const defaults = useModelPreferencesStore((s) => s.defaults);
  const setDefault = useModelPreferencesStore((s) => s.setDefault);
  const clearDefault = useModelPreferencesStore((s) => s.clearDefault);

  return (
    <div>
      <Text size="big" id="default-models" className="settings-heading">
        {t("screens4_3.defaultModels.heading")}
      </Text>
      <Text className="description" sx={{ mb: 2 }}>
        {t("screens4_3.defaultModels.description")}
      </Text>

      <div className="default-models-list">
        {MODEL_TYPE_CONFIG.map((config) => (
          <DefaultModelRow
            key={config.type}
            modelType={config.type}
            label={t(`screens4_3.defaultModels.labels.${config.labelKey}`)}
            Select={config.Select}
            selectProps={"selectProps" in config && config.selectProps ? { ...config.selectProps, placeholder: t(`screens4_3.defaultModels.placeholders.${config.selectProps.placeholderKey}`) } : undefined}
            hint={"hintKey" in config ? t(`screens4_3.defaultModels.hints.${config.hintKey}`) : undefined}
            current={defaults[config.type]}
            onSelect={setDefault}
            onClear={clearDefault}
          />
        ))}
      </div>
    </div>
  );
}

interface ModelSelectExtraProps {
  placeholder?: string;
  requireToolSupport?: boolean;
}

interface DefaultModelRowProps {
  modelType: string;
  label: string;
  Select: React.ComponentType<
    {
      onChange: (value: unknown) => void;
      value: string;
    } & ModelSelectExtraProps
  >;
  selectProps?: ModelSelectExtraProps;
  hint?: string;
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
  selectProps,
  hint,
  current,
  onSelect,
  onClear
}: DefaultModelRowProps) {
  const { t } = useTranslation();
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
      <FormField label={label} helperText={hint}>
        <FlexRow align="center" gap={1}>
          <Select
            onChange={handleChange}
            value={current?.id || ""}
            {...selectProps}
          />
          {current && (
            <EditorButton size="small" onClick={handleClear}>
              {t("screens4_3.common.clear")}
            </EditorButton>
          )}
        </FlexRow>
      </FormField>
    </div>
  );
}

export default React.memo(DefaultModelsMenu);

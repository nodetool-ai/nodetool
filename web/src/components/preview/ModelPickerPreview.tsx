/**
 * Model picker with sample data, for the `/preview/model-picker` screenshot
 * route. The picker opens under a select button the way a node shows it, with
 * models from cloud and local providers in every execution state.
 */

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, Surface, SPACING } from "../ui_primitives";
import { getProviderDisplayName } from "../../utils/providerDisplay";
import ModelMenuDialogBase from "../model_menu/shared/ModelMenuDialogBase";
import ModelSelectButton from "../properties/shared/ModelSelectButton";
import {
  createModelMenuStore,
  type ModelSelectorModel
} from "../../stores/ModelMenuStore";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { ModelExecutionAvailability } from "@nodetool-ai/protocol";

const API: ModelExecutionAvailability = {
  kind: "api",
  state: "ready",
  label: "API",
  reason: ""
};
const LOCAL: ModelExecutionAvailability = {
  kind: "local",
  state: "ready",
  label: "Local",
  reason: ""
};

const model = (
  provider: string,
  id: string,
  name: string,
  execution: ModelExecutionAvailability = API
): ModelSelectorModel => ({
  type: "language_model",
  provider: provider as ModelSelectorModel["provider"],
  id,
  name,
  execution
});

const SAMPLE_MODELS: ModelSelectorModel[] = [
  model("anthropic", "claude-opus-4-1", "Claude Opus 4.1"),
  model("anthropic", "claude-sonnet-4-5", "Claude Sonnet 4.5"),
  model("anthropic", "claude-haiku-4-5", "Claude Haiku 4.5"),
  model("openai", "gpt-5", "GPT-5"),
  model("openai", "gpt-5-mini", "GPT-5 mini"),
  model("openai", "gpt-4.1", "GPT-4.1"),
  model("gemini", "gemini-2.5-pro", "Gemini 2.5 Pro"),
  model("gemini", "gemini-2.5-flash", "Gemini 2.5 Flash"),
  model("ollama", "qwen3:8b", "Qwen3 8B", LOCAL),
  model("ollama", "llama3.2:3b", "Llama 3.2 3B", LOCAL),
  model("ollama", "gemma3:12b", "Gemma 3 12B", {
    ...LOCAL,
    state: "download_required",
    reason: ""
  }),
  model("mistral", "mistral-large-latest", "Mistral Large"),
  model("groq", "llama-3.3-70b-versatile", "Llama 3.3 70B Versatile")
];

const SAMPLE_PROVIDERS = [
  "anthropic",
  "openai",
  "gemini",
  "ollama",
  "mistral",
  "groq"
];

const useSampleMenuStore = createModelMenuStore<ModelSelectorModel>();

const MODEL_DATA = {
  models: SAMPLE_MODELS,
  isLoading: false,
  isFetching: false,
  error: null,
  providers: SAMPLE_PROVIDERS,
  refetch: () => undefined
};

const noop = (): void => undefined;

const PreviewModelPicker: React.FC = () => {
  const { t } = useTranslation("translation", {
    keyPrefix: "batch2_14.modelPicker"
  });
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const models = SAMPLE_MODELS.map((sample) => {
    if (!sample.execution) {
      return sample;
    }
    if (sample.execution.kind === "api") {
      return {
        ...sample,
        execution: { ...sample.execution, reason: t("apiReason") }
      };
    }
    if (sample.execution.state === "download_required") {
      return {
        ...sample,
        execution: { ...sample.execution, reason: t("downloadReason") }
      };
    }
    return {
      ...sample,
      execution: { ...sample.execution, reason: t("localReason") }
    };
  });
  const modelData = { ...MODEL_DATA, models };

  useEffect(() => {
    const prefs = useModelPreferencesStore.getState();
    if (!prefs.isFavorite("anthropic", "claude-sonnet-4-5")) {
      prefs.toggleFavorite("anthropic", "claude-sonnet-4-5");
    }
    prefs.setDefault("language_model", {
      provider: "anthropic",
      id: "claude-sonnet-4-5",
      name: "Claude Sonnet 4.5"
    });
  }, []);

  return (
    <Box
      sx={{ p: SPACING.xl, minHeight: "100vh", bgcolor: "background.default" }}
    >
      <Surface data-preview="model-picker" sx={{ p: SPACING.md, width: 280 }}>
        <ModelSelectButton
          ref={setAnchorEl}
          label="Claude Sonnet 4.5"
          secondaryLabel={getProviderDisplayName("anthropic")}
          subLabel={t("selectLanguageModel")}
          active
          onClick={noop}
        />
      </Surface>
      {anchorEl && (
        <ModelMenuDialogBase<ModelSelectorModel>
          open
          anchorEl={anchorEl}
          onClose={noop}
          modelData={modelData}
          title={t("selectLanguageModel")}
          searchPlaceholder={t("searchLanguageModels")}
          storeHook={useSampleMenuStore}
          modelType="language_model"
        />
      )}
    </Box>
  );
};

export default PreviewModelPicker;

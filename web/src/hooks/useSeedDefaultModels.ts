/**
 * Once a provider is connected, its first language model becomes the default
 * everywhere.
 *
 * Runs once at the app root. When the Settings "Default Models" list has no
 * `language_model` (or `image_model`, or `tts_model`), it pins the first usable model of a
 * connected API or cloud provider. Local models come second, and a model that
 * is not installed or whose provider has no key is never picked. A default the
 * user set is never overwritten.
 *
 * It then starts the chat on that default (the chat store otherwise holds an
 * unsendable placeholder), starts the composer's speech mode on the speech
 * default, and fills the empty model properties of nodes in the
 * open workflows, so connecting a key does not leave a node on "Select model".
 */

import { useEffect } from "react";
import { isModelSelected } from "@nodetool-ai/protocol";
import useGlobalChatStore from "../stores/GlobalChatStore";
import useMediaGenerationStore from "../stores/MediaGenerationStore";
import useMetadataStore from "../stores/MetadataStore";
import useModelPreferencesStore from "../stores/ModelPreferencesStore";
import type { DefaultModel } from "../stores/ModelPreferencesStore";
import type { LanguageModel, TTSModel } from "../stores/ApiTypes";
import { audioModelPatch } from "../components/chat/composer/modelSelection";
import { applyDefaultModels } from "../utils/applyDefaultModels";
import { isLocalProvider } from "../utils/providerDisplay";
import { useWorkflowManagerStore } from "../contexts/WorkflowManagerContext";
import {
  useImageModelsByProvider,
  useLanguageModelsByProvider,
  useTTSModelsByProvider
} from "./useModelsByProvider";
import { useModelAvailability } from "./useModelAvailability";
import {
  recommendedModelKey,
  useRecommendedModelKeys
} from "./useRecommendedModelKeys";

type Seedable = {
  provider?: string | null;
  id: string;
  name?: string | null;
  execution?: { state?: string } | null;
};

/**
 * The first usable model: a connected API or cloud provider before a local
 * one, and within each group a recommended model before list order.
 */
export const pickSeedModel = <T extends Seedable>(
  models: readonly T[],
  isAvailable: (model: T) => boolean,
  preferredKeys: readonly string[] = []
): T | null => {
  const usable = models.filter((model) => model.id && isAvailable(model));
  for (const group of [
    usable.filter((m) => !isLocalProvider(m.provider ?? undefined)),
    usable.filter((m) => isLocalProvider(m.provider ?? undefined))
  ]) {
    for (const key of preferredKeys) {
      const match = group.find(
        (m) => recommendedModelKey(m.provider ?? "", m.id) === key
      );
      if (match) {
        return match;
      }
    }
    if (group.length > 0) {
      return group[0];
    }
  }
  return null;
};

const toDefault = (
  model: Seedable & { supported_tasks?: string[] | null }
): DefaultModel => {
  const seeded: DefaultModel = {
    provider: model.provider ?? "",
    id: model.id,
    name: model.name || model.id
  };
  if (model.supported_tasks) {
    seeded.supported_tasks = [...model.supported_tasks];
  }
  return seeded;
};

export const useSeedDefaultModels = (): void => {
  const workflowManager = useWorkflowManagerStore();
  const languageDefault = useModelPreferencesStore(
    (s) => s.defaults["language_model"]
  );
  const selectedModel = useGlobalChatStore((s) => s.selectedModel);
  const setSelectedModel = useGlobalChatStore((s) => s.setSelectedModel);
  const language = useLanguageModelsByProvider();
  const image = useImageModelsByProvider({ task: "text_to_image" });
  const tts = useTTSModelsByProvider();
  const ttsDefault = useModelPreferencesStore((s) => s.defaults["tts_model"]);
  const speechModel = useMediaGenerationStore((s) => s.audio.model);
  const getAvailability = useModelAvailability();
  const recommendedKeys = useRecommendedModelKeys();

  useEffect(() => {
    if (language.isLoading || image.isLoading) {
      return;
    }
    const preferences = useModelPreferencesStore.getState();
    let seeded = false;

    if (!preferences.defaults["language_model"]) {
      const pick = pickSeedModel(
        language.models,
        (m: LanguageModel) => getAvailability(m).available,
        recommendedKeys
      );
      if (pick) {
        preferences.setDefault("language_model", toDefault(pick));
        seeded = true;
      }
    }
    if (!preferences.defaults["image_model"]) {
      const pick = pickSeedModel(
        image.models,
        (m) => getAvailability(m).available
      );
      if (pick) {
        preferences.setDefault("image_model", toDefault(pick));
        seeded = true;
      }
    }
    if (!preferences.defaults["tts_model"] && !tts.isLoading) {
      const pick = pickSeedModel(
        tts.models,
        (m) => getAvailability(m).available
      );
      if (pick) {
        preferences.setDefault("tts_model", toDefault(pick));
        seeded = true;
      }
    }
    if (seeded) {
      fillOpenWorkflows(workflowManager);
    }
  }, [
    language.isLoading,
    language.models,
    image.isLoading,
    image.models,
    tts.isLoading,
    tts.models,
    getAvailability,
    recommendedKeys,
    workflowManager
  ]);

  // The chat starts on the Settings default instead of an empty choice.
  useEffect(() => {
    if (languageDefault && !isModelSelected(selectedModel)) {
      setSelectedModel({
        type: "language_model",
        provider: languageDefault.provider,
        id: languageDefault.id,
        name: languageDefault.name
      } as LanguageModel);
    }
  }, [languageDefault, selectedModel, setSelectedModel]);

  // Speech starts on the Settings default too, with that model's voices.
  useEffect(() => {
    if (!ttsDefault || isModelSelected(speechModel)) {
      return;
    }
    const model = tts.models.find(
      (m: TTSModel) =>
        m.provider === ttsDefault.provider && m.id === ttsDefault.id
    );
    if (model) {
      const { setAudioParams, audio } = useMediaGenerationStore.getState();
      setAudioParams(audioModelPatch(model, audio.voice));
    }
  }, [ttsDefault, speechModel, tts.models]);
};

/** Fill empty model properties of every node in the open workflows. */
export const fillOpenWorkflows = (
  workflowManager: ReturnType<typeof useWorkflowManagerStore>
): void => {
  const { getMetadata } = useMetadataStore.getState();
  for (const nodeStore of Object.values(workflowManager.getState().nodeStores)) {
    const { nodes, updateNodeProperties } = nodeStore.getState();
    for (const node of nodes) {
      const metadata = node.type ? getMetadata(node.type) : undefined;
      if (!metadata) {
        continue;
      }
      const current = node.data?.properties ?? {};
      const filled = applyDefaultModels(
        current,
        metadata.properties,
        node.type
      );
      const changed: Record<string, unknown> = {};
      for (const key of Object.keys(filled)) {
        if (filled[key] !== current[key]) {
          changed[key] = filled[key];
        }
      }
      if (Object.keys(changed).length > 0) {
        updateNodeProperties(node.id, changed);
      }
    }
  }
};

export default useSeedDefaultModels;

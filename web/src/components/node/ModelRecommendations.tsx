import React, { useMemo } from "react";
import { UnifiedModel } from "../../stores/ApiTypes";
import useMetadataStore from "../../stores/MetadataStore";
import ModelRecommendationsButton from "./ModelRecommendationsButton";
import { isMac } from "../../utils/platform";
import { llama_models } from "../../config/models";

interface ModelRecommendationsProps {
  nodeType: string;
}

type AggregatedSource = {
  type: string;
  requireMac?: boolean;
};

const AGGREGATED_RECOMMENDATION_SOURCES: Record<string, AggregatedSource[]> = {
  "nodetool.text.AutomaticSpeechRecognition": [
    { type: "mlx.automatic_speech_recognition.Whisper", requireMac: true },
    { type: "huggingface.automatic_speech_recognition.Whisper" }
  ],
  "nodetool.audio.TextToSpeech": [
    { type: "mlx.text_to_speech.KokoroTTS", requireMac: true },
    { type: "huggingface.text_to_speech.KokoroTTS" }
  ],
  "nodetool.image.TextToImage": [
    { type: "mlx.text_to_image.MFlux", requireMac: true },
    { type: "huggingface.text_to_image.StableDiffusion" },
    { type: "huggingface.text_to_image.StableDiffusionXL" },
    { type: "huggingface.text_to_image.Flux" },
    { type: "huggingface.text_to_image.Kolors" },
    { type: "huggingface.text_to_image.Chroma" },
    { type: "huggingface.image_to_image.ImageToImage" }
  ],
  "nodetool.image.ImageToImage": [
    { type: "mlx.image_to_image.MFluxImageToImage", requireMac: true },
    { type: "huggingface.image_to_image.QwenImage" },
    { type: "huggingface.image_to_image.QwenImageEdit" },
    { type: "huggingface.image_to_image.RealESRGAN" },
    { type: "huggingface.image_to_image.Swin2SR" },
    { type: "huggingface.image_to_image.StableDiffusionControlNet" },
    { type: "huggingface.image_to_image.StableDiffusionUpscale" },
    { type: "huggingface.image_to_image.StableDiffusionXLControlNet" },
    { type: "huggingface.image_to_image.VAEEncode" },
  ],
  "nodetool.agents.Agent": [
    { type: "nodetool.agents.Agent" },
    { type: "mlx.text_generation.TextGeneration", requireMac: true },
    { type: "huggingface.text_generation.TextGeneration" }
  ]
};

const ModelRecommendations: React.FC<ModelRecommendationsProps> = ({
  nodeType
}) => {
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const isMacPlatform = isMac();

  const recommendedModels: UnifiedModel[] = useMemo(() => {
    const modelsMap = new Map<string, UnifiedModel>();
    const baseMetadata = getMetadata(nodeType);
    baseMetadata?.recommended_models?.forEach((model) => {
      modelsMap.set(model.id, model);
    });

    const aggregatedSources = AGGREGATED_RECOMMENDATION_SOURCES[nodeType] || [];
    aggregatedSources.forEach(({ type, requireMac }) => {
      if (requireMac && !isMacPlatform) {
        return;
      }
      const metadata = getMetadata(type);
      metadata?.recommended_models?.forEach((model) => {
        if (!modelsMap.has(model.id)) {
          modelsMap.set(model.id, model);
        }
      });
    });

    return Array.from(modelsMap.values());
  }, [getMetadata, nodeType, isMacPlatform]);

  return <ModelRecommendationsButton recommendedModels={recommendedModels} />;
};

export default ModelRecommendations;

import { Box, Stack, Typography } from "@mui/material";
import { Property } from "../../stores/ApiTypes";
import { InferenceProvider } from "../../stores/ApiTypes";
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Select from "../inputs/Select";

interface HuggingFaceModel {
  id: string;
  author?: string;
  sha?: string;
  pipeline_tag?: string;
  tags?: string[];
  private?: boolean;
  gated?: boolean;
  inference?: string;
  lastModified?: string;
  likes?: number;
  downloads?: number;
  library_name?: string;
  [key: string]: any;
}

const fetchModelsForProvider = async (provider: InferenceProvider, pipelineTag: string): Promise<HuggingFaceModel[]> => {
  const response = await fetch(`https://huggingface.co/api/models?inference_provider=${provider}&pipeline_tag=${pipelineTag}&limit=100`);
  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.statusText}`);
  }
  return response.json();
};

const InferenceProviderModelSelect = ({
  property,
  onChange,
  value
}: {
  property: Property;
  onChange: (inferenceProviderModel: any) => void;
  value: any;
}) => {
    const [provider, setProvider] = useState<InferenceProvider>(value.provider);
    const providerOptions = [
        {
            label: "Cerebras",
            value: "cerebras"
        },
        {
            label: "Cohere",
            value: "cohere"
        },
        {
            label: "Fal AI",
            value: "fal-ai"
        },
        {
            label: "Featherless AI",
            value: "featherless-ai"
        },
        {
            label: "Fireworks AI",
            value: "fireworks-ai"
        },
        {
            label: "Groq",
            value: "groq"
        },
        {
            label: "HF Inference",
            value: "hf-inference"
        },
        {
            label: "Hyperbolic",
            value: "hyperbolic"
        },
        {
            label: "Nebius",
            value: "nebius"
        },
        {
            label: "Novita",
            value: "novita"
        },
        {
            label: "Nscale",
            value: "nscale"
        },
        {
            label: "OpenAI",
            value: "openai"
        },
        {
            label: "Replicate",
            value: "replicate"
        },
        {
            label: "Sambanova",
            value: "sambanova"
        },
        {
            label: "Together",
            value: "together"
        }
    ];
    const pipelineTag = useMemo(() => {
        switch (property.type.type) {
        case "inference_provider_automatic_speech_recognition_model":
            return "automatic-speech-recognition";
        case "inference_provider_audio_classification_model":
            return "audio-classification";
        case "inference_provider_image_classification_model":
            return "image-classification";
        case "inference_provider_text_classification_model":
            return "text-classification";
        case "inference_provider_summarization_model":
            return "summarization";
        case "inference_provider_text_to_image_model":
            return "text-to-image";
        case "inference_provider_translation_model":
            return "translation";
        case "inference_provider_text_to_text_model":
            return "text-to-text";
        case "inference_provider_text_to_speech_model":
            return "text-to-speech";
        case "inference_provider_text_to_audio_model":
            return "text-to-audio";
        case "inference_provider_text_generation_model":
            return "text-generation";
        case "inference_provider_image_to_image_model":
            return "image-to-image";
        case "inference_provider_image_segmentation_model":
            return "image-segmentation";
        default:
            return "";
        }
    }, [property.type.type]);

    // Fetch models for the selected provider
    const { data: models, isLoading: isLoadingModels, error: modelsError } = useQuery({
        queryKey: ['inference-models', value.provider, pipelineTag],
        queryFn: () => fetchModelsForProvider(value.provider, pipelineTag),
        enabled: !!value.provider && !!pipelineTag,
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes
    });

    const handleChangeProvider = useCallback((selectedValue: string) => {
        setProvider(selectedValue as InferenceProvider);
        onChange({
            type: property.type.type,
            provider: selectedValue as InferenceProvider,
            model_id: ""
        });
    }, [onChange, property.type]);

    const handleChangeModel = useCallback((selectedValue: string) => {
        onChange({
            type: property.type.type,
            model_id: selectedValue,
            provider: provider
        });
    }, [onChange, property.type, provider]);

    const modelOptions = useMemo(() => {
        if (!models) {return [];}
        return models.map((model) => ({
            value: model.id,
            label: model.id
        }));
    }, [models]);

    return (
        <Stack spacing={2}>
            <Box>
                <Typography variant="body2" sx={{ mb: 1 }}>
                    Provider
                </Typography>
                <Select
                    options={providerOptions}
                    value={value.provider}
                    onChange={handleChangeProvider}
                    placeholder="Select an inference provider"
                    fuseOptions={{
                        keys: ["label"]
                    }}
                />
            </Box>
            
            {value.provider && (
                <Box>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                        Model
                    </Typography>
                    <Select
                        options={modelOptions}
                        value={value.model_id}
                        onChange={handleChangeModel}
                        placeholder={
                            isLoadingModels 
                                ? "Loading models..." 
                                : modelsError 
                                    ? "Error loading models" 
                                    : "Select a model"
                        }
                        fuseOptions={{
                            keys: ["label"]
                        }}
                    />
                </Box>
            )}
        </Stack>
    );
};

export default InferenceProviderModelSelect;
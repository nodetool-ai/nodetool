import { useMemo, useCallback, memo } from "react";
import useModelStore from "../../stores/ModelStore";
import { useQuery } from "@tanstack/react-query";
import { OpenAIModel } from "../../stores/ApiTypes";
import { isEqual } from "lodash";
import Select from "../inputs/Select";

interface LanguageModelSelectProps {
  onChange: (value: any) => void;
  value: string;
}

// Define the hardcoded models
const staticModels = [
  {
    id: "claude-3-5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic"
  },
  {
    id: "claude-3-7-sonnet",
    name: "Claude 3.7 Sonnet",
    provider: "anthropic"
  },
  {
    id: "gemini-2.5-pro-exp-03-25",
    name: "Gemini 2.5 Pro Experimental",
    provider: "google"
  },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google" },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
  {
    id: "gpt-4o-audio-preview-2024-12-17",
    name: "GPT-4o Audio",
    provider: "openai"
  },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
  {
    id: "gpt-4o-mini-audio-preview-2024-12-17",
    name: "GPT-4o Mini Audio",
    provider: "openai"
  },
  { id: "chatgpt-4o-latest", name: "ChatGPT-4o", provider: "openai" },
  { id: "gpt-4.1", name: "GPT-4.1", provider: "openai" },
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", provider: "openai" },
  { id: "gpt-4.1-nano", name: "GPT-4.1 Nano", provider: "openai" },
  { id: "o3", name: "O3", provider: "openai" },
  { id: "o4-mini", name: "O4 Mini", provider: "openai" }
];

const staticModelIds = new Set(staticModels.map((m) => m.id));

const LanguageModelSelect = ({ onChange, value }: LanguageModelSelectProps) => {
  const loadOpenAIModels = useModelStore((state) => state.loadOpenAIModels);

  const {
    data: models,
    isError,
    isLoading,
    isSuccess
  } = useQuery({
    queryKey: ["models", "openai_model"], // Keep query key for fetching OpenAI models
    queryFn: loadOpenAIModels
  });

  const options = useMemo(() => {
    if (isLoading) return []; // Return empty while loading to avoid flashing "Select a model"

    const openAIOptions = ((models as OpenAIModel[]) || []).map((model) => ({
      value: model.id || "",
      label: model.id || ""
    }));

    const staticOptions = staticModels.map((model) => ({
      value: model.id,
      label: model.name
    }));

    const combinedOptions = [...openAIOptions, ...staticOptions].filter(
      (option) => option.value
    ); // Filter out any empty values

    // Remove duplicates if any model id appears in both lists (unlikely but safe)
    const uniqueOptions = Array.from(
      new Map(combinedOptions.map((item) => [item.value, item])).values()
    );

    // Sort options alphabetically by label
    uniqueOptions.sort((a, b) => a.label.localeCompare(b.label));

    return [
      { value: "", label: "Select a model" }, // Add the placeholder option
      ...uniqueOptions
    ];
  }, [models, isLoading]); // Removed isError from deps as we handle it below

  const handleChange = useCallback(
    (selectedValue: string) => {
      onChange({
        type: "language_model",
        id: selectedValue
      });
    },
    [onChange]
  );

  // Check if the current value exists in the combined options list
  const isValueMissing = value && !options.some((v) => v.value === value);

  if (isLoading) {
    return <div>Loading models...</div>;
  }

  if (isError) {
    return <div>Error loading models</div>;
  }

  // Adjust the "No models found" message if needed, considering static models are always present
  if (isSuccess && options.length <= 1) {
    // <= 1 because of the placeholder
    return (
      <div>
        Error loading OpenAI models. Only manually added models available.
      </div>
    );
  }

  return (
    <Select
      options={[
        ...options,
        // Add the missing value option if the current value isn't in the list
        ...(isValueMissing
          ? [
              {
                value,
                label: `${value} (missing)`
              }
            ]
          : [])
      ]}
      value={value}
      onChange={handleChange}
      placeholder="Select a model"
    />
  );
};

export default memo(LanguageModelSelect, isEqual);

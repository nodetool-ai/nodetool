import { useMemo, useCallback, memo } from "react";
import useModelStore from "../../stores/ModelStore";
import { useQuery } from "@tanstack/react-query";
import { LlamaModel, OpenAIModel } from "../../stores/ApiTypes";
import { isEqual } from "lodash";
import Select from "../inputs/Select";

interface OpenAIModelSelectProps {
  onChange: (value: any) => void;
  value: string;
}

const OpenAIModelSelect = ({ onChange, value }: OpenAIModelSelectProps) => {
  const loadOpenAIModels = useModelStore((state) => state.loadOpenAIModels);

  const {
    data: models,
    isError,
    isLoading,
    isSuccess
  } = useQuery({
    queryKey: ["models", "openai_model"],
    queryFn: loadOpenAIModels
  });

  const options = useMemo(() => {
    if (!models || isLoading || isError) return [];
    return [
      { value: "", label: "Select a model" },
      ...(models as OpenAIModel[])
        .map((model) => ({
          value: model.id || "",
          label: model.id || ""
        }))
        .sort((a, b) => a.label.localeCompare(b.label))
    ];
  }, [models, isLoading, isError]);

  const handleChange = useCallback(
    (selectedValue: string) => {
      onChange({
        type: "openai_model",
        id: selectedValue
      });
    },
    [onChange]
  );

  const isValueMissing = value && !options.some((v) => v.value === value);

  if (isLoading) {
    return <div>Loading models...</div>;
  }

  if (isError) {
    return <div>Error loading models</div>;
  }

  if (isSuccess && options.length === 1) {
    return (
      <div>No models found. Click RECOMMENDED MODELS above to find models.</div>
    );
  }

  return (
    <Select
      options={[
        ...options,
        ...(isValueMissing ? [{ value, label: `${value} (missing)` }] : [])
      ]}
      value={value}
      onChange={handleChange}
      placeholder="Select a model"
    />
  );
};

export default memo(OpenAIModelSelect, isEqual);

import { useMemo, useCallback, memo } from "react";
import useModelStore from "../../stores/ModelStore";
import { useQuery } from "@tanstack/react-query";
import { LlamaModel } from "../../stores/ApiTypes";
import { isEqual } from "lodash";
import Select from "../inputs/Select";
import { useOllamaModels } from "../../hooks/useOllamaModels";

interface LlamaModelSelectProps {
  onChange: (value: any) => void;
  value: string;
}

const LlamaModelSelect = ({ onChange, value }: LlamaModelSelectProps) => {
  const { ollamaModels, ollamaLoading, ollamaIsFetching, ollamaError } =
    useOllamaModels();

  const options = useMemo(() => {
    if (!ollamaModels || ollamaLoading || ollamaIsFetching || ollamaError)
      return [];
    return [
      { value: "", label: "Select a model" },
      ...ollamaModels
        .map((model) => ({
          value: model.repo_id || "",
          label: model.name || ""
        }))
        .sort((a, b) => a.label.localeCompare(b.label))
    ];
  }, [ollamaModels, ollamaLoading, ollamaIsFetching, ollamaError]);

  const handleChange = useCallback(
    (selectedValue: string) => {
      onChange({
        type: "llama_model",
        repo_id: selectedValue
      });
    },
    [onChange]
  );

  const isValueMissing = value && !options.some((v) => v.value === value);

  if (ollamaLoading) {
    return <div>Loading models...</div>;
  }

  if (ollamaError) {
    return <div>Error loading models</div>;
  }

  if (ollamaIsFetching && options.length === 1) {
    return (
      <div>No models found. Please start Ollama and download a model.</div>
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

export default memo(LlamaModelSelect, isEqual);

import { useMemo, useCallback } from "react";
import useModelStore from "../../stores/ModelStore";
import { useQuery } from "@tanstack/react-query";
import { LlamaModel } from "../../stores/ApiTypes";

interface LlamaModelSelectProps {
  onChange: (value: any) => void;
  value: string;
}

export default function LlamaModelSelect({
  onChange,
  value
}: LlamaModelSelectProps) {
  const loadLlamaModels = useModelStore((state) => state.loadLlamaModels);

  const {
    data: models,
    isError,
    isLoading,
    isSuccess
  } = useQuery({
    queryKey: ["models", "llama_model"],
    queryFn: loadLlamaModels
  });

  const values = useMemo(() => {
    if (!models || isLoading || isError) return [];
    return (models as LlamaModel[]).map((model) => ({
      value: model.repo_id,
      label: model.name
    }));
  }, [models, isLoading, isError]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({
        type: "llama_model",
        repo_id: e.target.value
      });
    },
    [onChange]
  );

  const isValueMissing = value && !values.some((v) => v.value === value);

  return (
    <select
      value={isValueMissing ? "" : value || ""}
      onChange={handleChange}
      className="nodrag"
    >
      <option value="">Select a model</option>
      {isLoading && (
        <option value="" disabled>
          Loading models...
        </option>
      )}
      {isError && (
        <option value="" disabled>
          Error loading models
        </option>
      )}
      {isSuccess && values.length === 0 && (
        <option value="" disabled>
          No models found. Click RECOMMENDED MODELS above to find models.
        </option>
      )}
      {isValueMissing && (
        <option value="" disabled style={{ color: "red" }}>
          {value} (missing)
        </option>
      )}
      {values?.map(({ value: modelValue, label }) => (
        <option key={`model-${modelValue}`} value={modelValue}>
          {label}
        </option>
      ))}
    </select>
  );
}

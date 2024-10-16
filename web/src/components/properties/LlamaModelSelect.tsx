import { useMemo, useCallback, memo } from "react";
import useModelStore from "../../stores/ModelStore";
import { useQuery } from "@tanstack/react-query";
import { LlamaModel } from "../../stores/ApiTypes";
import { isEqual } from "lodash";
import Select from "../inputs/Select";

interface LlamaModelSelectProps {
  onChange: (value: any) => void;
  value: string;
}

const LlamaModelSelect = ({ onChange, value }: LlamaModelSelectProps) => {
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

  const options = useMemo(() => {
    if (!models || isLoading || isError) return [];
    return [
      { value: "", label: "Select a model" },
      ...(models as LlamaModel[]).map((model) => ({
        value: model.repo_id || "",
        label: model.name || ""
      }))
    ];
  }, [models, isLoading, isError]);

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

export default memo(LlamaModelSelect, isEqual);

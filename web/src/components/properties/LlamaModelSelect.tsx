import { useMemo, useCallback } from "react";
import { Select, SelectChangeEvent } from "@mui/material";
import MenuItem from "@mui/material/MenuItem";
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
    (e: SelectChangeEvent) => {
      onChange({
        type: "llama_model",
        repo_id: e.target.value
      });
    },
    [onChange]
  );

  return (
    <Select
      value={value || ""}
      onChange={handleChange}
      variant="standard"
      className="mui-select nodrag"
      disableUnderline={true}
    >
      <MenuItem value="" key="select-model">
        Select a model
      </MenuItem>
      {isLoading && (
        <MenuItem value="" key="loading">
          Loading models...
        </MenuItem>
      )}
      {isError && (
        <MenuItem value="" key="error">
          Error loading models
        </MenuItem>
      )}
      {isSuccess && values.length === 0 && (
        <MenuItem value="" key="no-models">
          No models found. Click RECOMMENDED MODELS above to find models.
        </MenuItem>
      )}
      {values?.map(({ value: modelValue, label }, index) => (
        <MenuItem key={`model-${modelValue}`} value={modelValue}>
          {label}
        </MenuItem>
      ))}
    </Select>
  );
}

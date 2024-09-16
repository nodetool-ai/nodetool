import { useMemo, useCallback } from "react";
import { Select, SelectChangeEvent } from "@mui/material";
import MenuItem from "@mui/material/MenuItem";
import useModelStore from "../../stores/ModelStore";
import { useQuery } from "@tanstack/react-query";
import { ModelFile } from "../../stores/ApiTypes";

interface ComfyModelSelectProps {
  modelType: string;
  onChange: (value: any) => void;
  value: string;
}

export default function ComfyModelSelect({
  modelType,
  onChange,
  value
}: ComfyModelSelectProps) {
  const loadComfyModels = useModelStore((state) => state.loadComfyModels);

  const {
    data: models,
    isError,
    isLoading,
    isSuccess
  } = useQuery({
    queryKey: ["models", modelType],
    queryFn: () => loadComfyModels(modelType)
  });

  const values = useMemo(() => {
    if (!models || isLoading || isError) return [];
    return (models as ModelFile[]).map((model) => ({
      value: model.name,
      label: model.name
    }));
  }, [models, isLoading, isError]);

  const handleChange = useCallback(
    (e: SelectChangeEvent) => {
      onChange({
        type: modelType,
        name: e.target.value
      });
    },
    [onChange, modelType]
  );

  return (
    <Select
      value={value}
      onChange={handleChange}
      variant="standard"
      className="mui-select nodrag"
      disableUnderline={true}
    >
      {isLoading && <MenuItem value="">Loading models...</MenuItem>}
      {isError && <MenuItem value="">Error loading models</MenuItem>}
      {isSuccess && values.length === 0 && (
        <MenuItem value="">
          No models found. Place models in the models folder.
        </MenuItem>
      )}
      {values?.map(({ value, label }) => (
        <MenuItem key={value} value={value}>
          {label}
        </MenuItem>
      ))}
    </Select>
  );
}

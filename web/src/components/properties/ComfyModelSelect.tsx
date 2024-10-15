import { useMemo, useCallback, memo } from "react";
import useModelStore from "../../stores/ModelStore";
import { useQuery } from "@tanstack/react-query";
import { ModelFile } from "../../stores/ApiTypes";
import { isEqual } from "lodash";

interface ComfyModelSelectProps {
  modelType: string;
  onChange: (value: any) => void;
  value: string;
}

const ComfyModelSelect = ({
  modelType,
  onChange,
  value
}: ComfyModelSelectProps) => {
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
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({
        type: modelType,
        name: e.target.value
      });
    },
    [onChange, modelType]
  );

  const isValueMissing = value && !values.some((v) => v.value === value);

  return (
    <select
      value={isValueMissing ? "" : value}
      onChange={handleChange}
      className="nodrag"
    >
      {isLoading && <option value="">Loading models...</option>}
      {isError && <option value="">Error loading models</option>}
      {isSuccess && values.length === 0 && (
        <option value="">
          No models found. Place models in the models folder.
        </option>
      )}
      {isValueMissing && (
        <option value="" disabled style={{ color: "red" }}>
          {value} (missing)
        </option>
      )}
      {values?.map(({ value, label }) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
};

export default memo(ComfyModelSelect, isEqual);

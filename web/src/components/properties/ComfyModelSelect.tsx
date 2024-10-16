import { useMemo, useCallback, memo } from "react";
import useModelStore from "../../stores/ModelStore";
import { useQuery } from "@tanstack/react-query";
import { ModelFile } from "../../stores/ApiTypes";
import { isEqual } from "lodash";
import Select from "../inputs/Select";

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

  const options = useMemo(() => {
    if (!models || isLoading || isError) return [];
    return (models as ModelFile[]).map((model) => ({
      value: model.name,
      label: model.name || ""
    }));
  }, [models, isLoading, isError]);

  const handleChange = useCallback(
    (selectedValue: string) => {
      onChange({
        type: modelType,
        name: selectedValue
      });
    },
    [onChange, modelType]
  );

  const isValueMissing = value && !options.some((v) => v.value === value);

  const selectOptions = useMemo(() => {
    const baseOptions = [
      ...(isLoading ? [{ value: "", label: "Loading models..." }] : []),
      ...(isError ? [{ value: "", label: "Error loading models" }] : []),
      ...(isSuccess && options.length === 0
        ? [
            {
              value: "",
              label: "No models found. Place models in the models folder."
            }
          ]
        : []),
      ...(isValueMissing
        ? [{ value: "", label: `${value} (missing)`, disabled: true }]
        : []),
      ...options
    ];

    return baseOptions;
  }, [isLoading, isError, isSuccess, options, isValueMissing, value]);

  return (
    <Select
      options={selectOptions}
      value={isValueMissing ? "" : value}
      onChange={handleChange}
      placeholder="Select a model"
    />
  );
};

export default memo(ComfyModelSelect, isEqual);

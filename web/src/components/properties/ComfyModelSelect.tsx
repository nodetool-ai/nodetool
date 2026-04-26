import { useMemo, useCallback, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import isEqual from "fast-deep-equal";
import Select from "../inputs/Select";
import { BASE_URL } from "../../stores/BASE_URL";

type ComfyModelItem = { name?: string; path?: string; repo_id?: string; downloaded?: boolean };

interface ComfyModelSelection {
  type: string;
  name: string;
}

interface ComfyModelSelectProps {
  modelType: string;
  onChange: (value: ComfyModelSelection) => void;
  value: string;
}

const ComfyModelSelect = ({
  modelType,
  onChange,
  value
}: ComfyModelSelectProps) => {
  const loadComfyModels = useCallback(async (modelType: string) => {
    const res = await fetch(`${BASE_URL}/api/models/${modelType}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch models: ${res.status}`);
    }
    return (await res.json()) as ComfyModelItem[];
  }, []);

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
    if (!models || isLoading || isError) {return [];}
    return (models as ComfyModelItem[])
      .map((model) => ({
        value: model.name ?? model.path,
        label: model.name ?? model.path ?? ""
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
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

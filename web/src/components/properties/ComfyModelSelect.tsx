import { useMemo, useCallback, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import isEqual from "lodash/isEqual";
import Select from "../inputs/Select";
import { client } from "../../stores/ApiClient";
import { RepoPath } from "../../stores/ApiTypes";

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
  const loadComfyModels = useCallback(async (modelType: string) => {
    const { error, data } = await client.GET("/api/models/{model_type}" as any, {
      params: { path: { model_type: modelType } }
    });
    if (error) {
      throw error;
    }
    return data;
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
    return (models as Array<RepoPath | { name?: string }>).map((model) => ({
      value: (model as any).name ?? (model as RepoPath).path,
      label: (model as any).name ?? (model as RepoPath).path ?? ""
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

import { useMemo, useCallback, memo } from "react";
import { HuggingFaceModel } from "../../stores/ApiTypes";
import useModelStore from "../../stores/ModelStore";
import { useQuery } from "@tanstack/react-query";
import { tryCacheFiles } from "../../serverState/tryCacheFiles";
import { useMetadata } from "../../serverState/useMetadata";
import { isEqual } from "lodash";
import Select from "../inputs/Select";

interface HuggingFaceModelSelectProps {
  modelType: string;
  onChange: (value: any) => void;
  value: any;
}

const HuggingFaceModelSelect = ({
  modelType,
  onChange,
  value
}: HuggingFaceModelSelectProps) => {
  const { data: metadata } = useMetadata();
  const loadHuggingFaceModels = useModelStore(
    (state) => state.loadHuggingFaceModels
  );

  const {
    data: models,
    isError,
    isLoading,
    isSuccess
  } = useQuery({
    queryKey: ["models", modelType],
    queryFn: async () => {
      if (modelType.startsWith("hf.lora_sd")) {
        const loras = metadata?.recommendedModels.filter(
          (model) => model.type === modelType
        );
        const loraPaths = loras?.map((lora) => ({
          repo_id: lora.repo_id || "",
          path: lora.path || ""
        }));
        const loraModels = await tryCacheFiles(loraPaths || []);
        return loraModels
          ?.filter((m) => m.downloaded)
          .map((lora) => ({
            type: modelType,
            repo_id: lora.repo_id,
            path: lora.path
          }));
      } else {
        const recommendedModels = metadata?.recommendedModels.filter(
          (model) => model.type === modelType
        );
        const models = await loadHuggingFaceModels();
        return (
          recommendedModels?.reduce((acc, recommendedModel) => {
            const model = models.find(
              (m) => m.repo_id === recommendedModel.repo_id
            );
            if (model) {
              acc.push({
                ...model,
                path: recommendedModel.path
              });
            }
            return acc;
          }, [] as HuggingFaceModel[]) || []
        );
      }
    }
  });

  const options = useMemo(() => {
    if (!models || isLoading || isError) return [];
    return [
      { value: "", label: "None" },
      ...(models as HuggingFaceModel[]).map((model) => ({
        value: model.path ? `${model.repo_id}:${model.path}` : model.repo_id,
        label: model.path ? (
          <div>
            <div
              style={{
                fontSize: "0.9em",
                fontWeight: "normal",
                fontStyle: "italic"
              }}
            >
              {model.repo_id}
            </div>
            <div>{model.path}</div>
          </div>
        ) : (
          model.repo_id || ""
        )
      }))
    ];
  }, [models, isLoading, isError]);

  const handleChange = useCallback(
    (selectedValue: string) => {
      const [repo_id, path] = selectedValue.split(":");
      onChange({
        type: modelType,
        repo_id,
        path: path || undefined
      });
    },
    [onChange, modelType]
  );

  const selectValue = useMemo(() => {
    if (value?.repo_id && value?.path) {
      return `${value.repo_id}:${value.path}`;
    }
    return value?.repo_id || "";
  }, [value]);

  const isValueMissing =
    selectValue && !options.some((opt) => opt.value === selectValue);

  const placeholder = useMemo(() => {
    if (isLoading) return "Loading models...";
    if (isError) return "Error loading models";
    if (isSuccess && options.length === 1)
      return "No models found. Click RECOMMENDED MODELS above to find models.";
    if (isValueMissing) return `${selectValue} (missing)`;
    return "Select a model";
  }, [
    isLoading,
    isError,
    isSuccess,
    options.length,
    isValueMissing,
    selectValue
  ]);

  return (
    <Select
      options={options}
      value={isValueMissing ? "" : selectValue}
      onChange={handleChange}
      placeholder={placeholder}
    />
  );
};

export default memo(HuggingFaceModelSelect, isEqual);

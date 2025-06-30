import { useMemo, useCallback, memo } from "react";
import { HuggingFaceModel } from "../../stores/ApiTypes";
import useModelStore from "../../stores/ModelStore";
import { useQuery } from "@tanstack/react-query";
import { tryCacheFiles } from "../../serverState/tryCacheFiles";
import { isEqual } from "lodash";
import Select from "../inputs/Select";
import useMetadataStore from "../../stores/MetadataStore";

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
  const recommendedModels = useMetadataStore(
    (state) => state.recommendedModels
  );
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
        const loras = recommendedModels.filter(
          (model) => model.type === modelType
        );
        const loraPaths = loras?.map((lora) => ({
          repo_id: lora.repo_id || "",
          path: lora.path || "",
          downloaded: false
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
        const recommended =
          modelType === "hf.checkpoint_model"
            ? recommendedModels.filter(
                (model) =>
                  model.type === "hf.stable_diffusion" ||
                  model.type === "hf.stable_diffusion_xl" ||
                  model.type === "hf.stable_diffusion_3" ||
                  model.type === "hf.flux" ||
                  model.type === "hf.ltxv"
              )
            : recommendedModels.filter((model) => model.type === modelType);
        const models = await loadHuggingFaceModels();
        return (
          recommended?.reduce((acc, recommendedModel) => {
            const model = models.find(
              (m) => m.repo_id === recommendedModel.repo_id
            );
            if (model) {
              acc.push({
                type: modelType,
                repo_id: model.repo_id,
                path: recommendedModel.path || ""
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

    const modelOptions = (models as HuggingFaceModel[]).map((model) => ({
      value: model.path ? `${model.repo_id}:${model.path}` : model.repo_id,
      label: model.path ? (
        <div>
          <div
            style={{
              fontSize: "var(--fontSizeSmall)",
              fontWeight: "normal",
              lineHeight: "1.2",
              color: "var(--palette-grey-100)",
              fontStyle: "italic"
            }}
          >
            {model.repo_id}
          </div>
          <div
            style={{
              fontSize: "var(--fontSizeSmaller)",
              fontWeight: "normal",
              lineHeight: "1.4"
            }}
          >
            {model.path}
          </div>
        </div>
      ) : (
        model.repo_id || ""
      ),
      // Add sortKey for consistent sorting
      sortKey: model.path
        ? `${model.repo_id} ${model.path}`
        : model.repo_id || ""
    }));

    return [
      { value: "", label: "None", sortKey: "" },
      ...modelOptions.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
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
      fuseOptions={{
        keys: ["value"]
      }}
    />
  );
};

export default memo(HuggingFaceModelSelect, isEqual);

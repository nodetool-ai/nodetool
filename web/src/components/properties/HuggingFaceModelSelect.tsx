import { useMemo, useCallback } from "react";
import { Select, SelectChangeEvent } from "@mui/material";
import MenuItem from "@mui/material/MenuItem";
import useModelStore from "../../stores/ModelStore";
import { useQuery } from "@tanstack/react-query";
import { HuggingFaceModel } from "../../stores/ApiTypes";
import { tryCacheFiles } from "../tryCacheFiles";
import { useMetadata } from "../../serverState/useMetadata";

interface HuggingFaceModelSelectProps {
  modelType: string;
  onChange: (value: any) => void;
  value: any;
}

export default function HuggingFaceModelSelect({
  modelType,
  onChange,
  value
}: HuggingFaceModelSelectProps) {
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

  const values = useMemo(() => {
    if (!models || isLoading || isError) return [];
    return (models as HuggingFaceModel[]).map((model) => ({
      value: model.path ? `${model.repo_id}:${model.path}` : model.repo_id,
      label: modelType.startsWith("hf.lora_sd") ? model.path : model.repo_id
    }));
  }, [models, isLoading, isError, modelType]);

  const handleChange = useCallback(
    (e: SelectChangeEvent) => {
      const [repo_id, path] = e.target.value.split(":");
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

  return (
    <Select
      value={selectValue}
      onChange={handleChange}
      variant="standard"
      className="mui-select nodrag"
      disableUnderline={true}
    >
      {isLoading && <MenuItem value="">Loading models...</MenuItem>}
      {isError && <MenuItem value="">Error loading models</MenuItem>}
      {isSuccess && values.length === 0 && (
        <MenuItem value="">
          No models found. Click RECOMMENDED MODELS above to find models.
        </MenuItem>
      )}
      {isSuccess && values.length > 0 && <MenuItem value="">None</MenuItem>}
      {values?.map(({ value, label }) => (
        <MenuItem key={value} value={value}>
          {label}
        </MenuItem>
      ))}
    </Select>
  );
}

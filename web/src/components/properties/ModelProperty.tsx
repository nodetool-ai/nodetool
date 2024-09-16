import { useCallback, useMemo } from "react";
import { Select, SelectChangeEvent } from "@mui/material";
import MenuItem from "@mui/material/MenuItem";
import PropertyLabel from "../node/PropertyLabel";
import useModelStore from "../../stores/ModelStore";
import { PropertyProps } from "../node/PropertyInput";
import {
  FunctionModel,
  HuggingFaceModel,
  LlamaModel,
  ModelFile,
  RepoPath
} from "../../stores/ApiTypes";
import { useQuery } from "@tanstack/react-query";
import { useMetadata } from "../../serverState/useMetadata";
import { client } from "../../stores/ApiClient";

const tryCacheFiles = async (files: RepoPath[]) => {
  const { data, error } = await client.POST(
    "/api/models/huggingface/try_cache_files",
    {
      body: files
    }
  );
  if (error) {
    throw new Error("Failed to check if file is cached: " + error);
  }
  return data;
};

export default function ModelProperty(props: PropertyProps) {
  const id = `folder-${props.property.name}-${props.propertyIndex}`;
  const { data: metadata } = useMetadata();
  const loadModelFiles = useModelStore((state) => state.loadComfyModels);
  const loadFunctionModels = useModelStore((state) => state.loadFunctionModels);
  const loadLlamaModels = useModelStore((state) => state.loadLlamaModels);
  const loadHuggingFaceModels = useModelStore(
    (state) => state.loadHuggingFaceModels
  );
  const modelType = props.property.type.type;
  const selectValue = useMemo(() => {
    if (props.value?.repo_id && props.value?.path) {
      return `${props.value.repo_id}:${props.value.path}`;
    }
    return props.value?.path || props.value?.repo_id || "";
  }, [props.value]);

  const {
    data: models,
    isError,
    isLoading,
    isSuccess
  } = useQuery({
    queryKey: ["models", modelType],
    queryFn: async () => {
      if (modelType === undefined) return [];
      if (modelType === "function_model") {
        return await loadFunctionModels();
      }
      if (modelType === "llama_model") {
        return await loadLlamaModels();
      }
      // Special case for lora_sd models
      // as multiple files are in the same repo
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
      }
      if (modelType.startsWith("hf.")) {
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
      if (modelType.startsWith("comfy.")) {
        return await loadModelFiles(modelType);
      }
      return await loadModelFiles(modelType);
    }
  });

  const values = useMemo(() => {
    if (!models || isLoading || isError || modelType === undefined) return [];

    if (modelType === "function_model") {
      return (models as FunctionModel[]).map((model) => ({
        value: model.name,
        label: model.name
      }));
    }
    if (modelType === "llama_model") {
      return (models as LlamaModel[]).map((model) => ({
        value: model.name,
        label: model.name
      }));
    }
    if (modelType.startsWith("hf.lora_sd")) {
      return (models as HuggingFaceModel[]).map((model) => ({
        value: model.path ? `${model.repo_id}:${model.path}` : model.repo_id,
        label: model.path
      }));
    }
    if (modelType.startsWith("hf.")) {
      return (models as HuggingFaceModel[]).map((model) => ({
        value: model.path ? `${model.repo_id}:${model.path}` : model.repo_id,
        label: model.repo_id
      }));
    }
    if (modelType === "comfy.model") {
      return (models as ModelFile[]).map((model) => ({
        value: model.name,
        label: model.name
      }));
    }
    return [];
  }, [models, isLoading, isError, modelType]);

  const onModelChange = useCallback(
    (e: SelectChangeEvent) => {
      const modelValue = e.target.value;
      if (modelType === "function_model") {
        const functionModels = models as FunctionModel[];
        const provider = functionModels.find(
          (model: FunctionModel) => model.name === modelValue
        )?.provider;
        props.onChange({
          type: props.property.type.type,
          name: modelValue,
          provider: provider
        });
      } else if (modelType === "llama_model") {
        props.onChange({
          type: props.property.type.type,
          name: modelValue
        });
      } else if (modelType.startsWith("hf.")) {
        const [repo_id, path] = modelValue.split(":");
        props.onChange({
          type: props.property.type.type,
          repo_id,
          path: path || undefined
        });
      } else {
        props.onChange({
          type: props.property.type.type,
          name: modelValue
        });
      }
    },
    [metadata?.recommendedModels, modelType, models, props]
  );

  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <Select
        id={id}
        labelId={id}
        name=""
        value={selectValue}
        variant="standard"
        onChange={onModelChange}
        className="mui-select nodrag"
        disableUnderline={true}
        MenuProps={{
          anchorOrigin: {
            vertical: "bottom",
            horizontal: "left"
          },
          transformOrigin: {
            vertical: "top",
            horizontal: "left"
          }
        }}
      >
        {isLoading && <MenuItem value="">Loading models...</MenuItem>}
        {isError && <MenuItem value="">Error loading models</MenuItem>}
        {isSuccess && values.length === 0 && (
          <MenuItem value="">
            No models found. Click RECOMMENDED MODELS above to find models.
          </MenuItem>
        )}
        {isSuccess && <MenuItem value="">None</MenuItem>}
        {values?.map(({ value, label }) => (
          <MenuItem key={value} value={value}>
            {label}
          </MenuItem>
        ))}
      </Select>
    </>
  );
}

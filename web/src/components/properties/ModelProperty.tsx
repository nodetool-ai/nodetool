import { useCallback, useMemo } from "react";
import { Select, SelectChangeEvent, Typography } from "@mui/material";
import MenuItem from "@mui/material/MenuItem";
import PropertyLabel from "../node/PropertyLabel";
import useModelStore from "../../stores/ModelStore";
import { PropertyProps } from "../node/PropertyInput";
import {
  FunctionModel,
  HuggingFaceModel,
  LlamaModel,
  ModelFile
} from "../../stores/ApiTypes";
import { useQuery } from "@tanstack/react-query";
import { useMetadata } from "../../serverState/useMetadata";
import { client } from "../../stores/ApiClient";

const tryCacheFile = async (repo_id: string, path: string) => {
  const { data, error } = await client.GET(
    "/api/models/huggingface/try_cache_file",
    {
      params: {
        query: {
          repo_id,
          path
        }
      }
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
  const selectValue = props.value?.name || props.value?.repo_id || "";

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
        const loraModels = await Promise.all(
          loras?.filter(async (lora) => {
            return await tryCacheFile(lora.repo_id || "", lora.path || "");
          }) || []
        );
        return loraModels;
      }
      if (modelType.startsWith("hf.")) {
        const models = await loadHuggingFaceModels();
        return models.filter((model) => model.model_type === modelType);
      }
      if (modelType.startsWith("comfy.")) {
        return await loadModelFiles(modelType);
      }
      return await loadModelFiles(modelType);
    }
  });

  const values = useMemo(() => {
    if (!models) return [];
    if (isLoading || isError) return [];
    if (modelType === undefined) return [];
    if (modelType === "function_model") {
      const functionModels = models as FunctionModel[];
      return functionModels.map((model) => model.name);
    }
    if (modelType === "llama_model") {
      const llamaModels = models as LlamaModel[];
      return llamaModels.map((model) => model.name);
    }
    if (modelType.startsWith("hf.")) {
      const hfModels = models as HuggingFaceModel[];
      return hfModels.map((model) => model.repo_id);
    }
    if (modelType === "comfy.model") {
      const comfyModels = models as ModelFile[];
      return comfyModels.map((model) => model.name);
    }
    return [];
  }, [models, isLoading, isError, modelType]);

  const onModelChange = useCallback(
    (e: SelectChangeEvent) => {
      const modelName = e.target.value;
      if (modelType === "function_model") {
        const functionModels = models as FunctionModel[];
        const provider = functionModels.find(
          (model: FunctionModel) => model.name === modelName
        )?.provider;
        props.onChange({
          type: props.property.type.type,
          name: modelName,
          provider: provider
        });
      } else if (modelType === "llama_model") {
        props.onChange({
          type: props.property.type.type,
          name: modelName
        });
      } else if (modelType.startsWith("hf.")) {
        const m = metadata?.recommendedModels.find(
          (model: HuggingFaceModel) => model.repo_id === modelName
        );
        props.onChange({
          type: props.property.type.type,
          repo_id: modelName,
          path: m?.path
        });
      } else {
        props.onChange({
          type: props.property.type.type,
          name: modelName
        });
      }
    },
    [modelType, models, props]
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
        {isSuccess && <MenuItem value="">None</MenuItem>}
        {values?.map((modelName) => (
          <MenuItem key={modelName} value={modelName}>
            {modelName}
          </MenuItem>
        ))}
      </Select>
    </>
  );
}

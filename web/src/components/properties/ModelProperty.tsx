import { useCallback } from "react";
import { Select, SelectChangeEvent } from "@mui/material";
import MenuItem from "@mui/material/MenuItem";
import PropertyLabel from "../node/PropertyLabel";
import useModelStore from "../../stores/ModelStore";
import { PropertyProps } from "../node/PropertyInput";
import { FunctionModel, TypeName } from "../../stores/ApiTypes";
import { useQuery } from "@tanstack/react-query";
import { useMetadata } from "../../serverState/useMetadata";

export function comfyModelToFolder(type: TypeName) {
  switch (type) {
    case "comfy.checkpoint_file":
      return "checkpoints";
    case "comfy.vae_file":
      return "vae";
    case "comfy.clip_file":
      return "clip";
    case "comfy.clip_vision_file":
      return "clip_vision";
    case "comfy.control_net_file":
      return "controlnet";
    case "comfy.ip_adapter_file":
      return "ipadapter";
    case "comfy.gligen_file":
      return "gligen";
    case "comfy.upscale_model_file":
      return "upscale_models";
    case "comfy.lora_file":
      return "loras";
    case "comfy.unet_file":
      return "unet";
    case "comfy.instant_id_file":
      return "instantid";
    default:
      return type;
  }
}
export default function ModelProperty(props: PropertyProps) {
  const id = `folder-${props.property.name}-${props.propertyIndex}`;
  const loadModelFiles = useModelStore((state) => state.loadFiles);
  const functionModels = useModelStore((state) => state.functionModels);
  const { data: metadata } = useMetadata();
  const loadFunctionModels = useModelStore((state) => state.loadFunctionModels);
  const loadLlamaModels = useModelStore((state) => state.loadLlamaModels);
  const loadHuggingFaceModels = useModelStore(
    (state) => state.loadHuggingFaceModels
  );
  const modelType = props.property.type.type;
  const { data, isError } = useQuery({
    queryKey: ["models", modelType],
    queryFn: async () => {
      if (modelType === undefined) return [];
      if (modelType === "function_model") {
        const models = await loadFunctionModels();
        return models.map((model) => model.name);
      }
      if (modelType === "llama_model") {
        const models = await loadLlamaModels();
        return models.map((model) => model.name);
      }
      if (modelType.startsWith("hf.")) {
        const models = await loadHuggingFaceModels();
        return metadata?.recommendedModels
          .filter((model) => model.type === modelType)
          .map((model) => model.repo_id)
          .filter((repo_id) =>
            models.some((model) => model.repo_id === repo_id)
          );
      }
      if (modelType === "comfy.model") {
        const models = await loadModelFiles(comfyModelToFolder(modelType));
        return models;
      }
      return await loadModelFiles(modelType);
    }
  });

  const onModelChange = useCallback(
    (e: SelectChangeEvent) => {
      const modelName = e.target.value;
      if (modelType === "function_model") {
        const provider = functionModels.find(
          (model: FunctionModel) => model.name === name
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
        props.onChange({
          type: props.property.type.type,
          repo_id: modelName
        });
      } else {
        props.onChange({
          type: props.property.type.type,
          name: modelName
        });
      }
    },
    [modelType, functionModels, props]
  );

  const selectValue = props.value?.name || props.value?.repo_id || "";
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
        {isError && <MenuItem value="">Error loading models</MenuItem>}
        {modelType === undefined && (
          <MenuItem value="">No models available</MenuItem>
        )}
        {data?.map((modelName) => (
          <MenuItem key={modelName} value={modelName}>
            {modelName}
          </MenuItem>
        ))}
      </Select>
    </>
  );
}

import { useCallback } from "react";
import { Select } from "@mui/material";
import MenuItem from "@mui/material/MenuItem";
import PropertyLabel from "../node/PropertyLabel";
import useModelStore from "../../stores/ModelStore";
import { PropertyProps } from "../node/PropertyInput";
import { FunctionModel, LlamaModel, TypeName } from "../../stores/ApiTypes";
import { useQuery } from "react-query";

export function modelFolder(type: TypeName) {
  switch (type) {
    case "function_model":
      return "function_model";
    case "language_model":
      return "language_model";
    case "llama_model":
      return "llama_model";
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
    default:
      return undefined;
  }
}

export default function ModelProperty(props: PropertyProps) {
  const id = `folder-${props.property.name}-${props.propertyIndex}`;
  const loadModelFiles = useModelStore((state) => state.loadFiles);
  const functionModels = useModelStore((state) => state.functionModels);
  const loadFunctionModels = useModelStore((state) => state.loadFunctionModels);
  const loadLlamaModels = useModelStore((state) => state.loadLlamaModels);
  const folder = modelFolder(props.property.type.type);

  const { data, isError } = useQuery(["models", folder], async () => {
    if (folder === undefined) return [];
    if (folder === "function_model") return loadFunctionModels();
    if (folder === "llama_model") return loadLlamaModels();
    return loadModelFiles(folder);
  });

  const modelNames =
    data?.map((model: FunctionModel | LlamaModel | string) =>
      typeof model === "string" ? model : model.name
    ) || [];

  const providerFor = useCallback(
    (name: string) => {
      return functionModels.find((model: FunctionModel) => model.name === name)
        ?.provider;
    },
    [functionModels]
  );

  const selectValue = props.value?.name || "";

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
        onChange={(e) =>
          props.onChange({
            type: props.property.type.type,
            name: e.target.value,
            provider: providerFor(e.target.value)
          })
        }
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
        {folder === undefined && (
          <MenuItem value="">No models available</MenuItem>
        )}
        {modelNames.map((modelName) => (
          <MenuItem key={modelName} value={modelName}>
            {modelName}
          </MenuItem>
        ))}
      </Select>
    </>
  );
}

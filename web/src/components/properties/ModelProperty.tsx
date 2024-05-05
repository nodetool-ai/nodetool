import { useEffect, useState } from "react";
import { Select } from "@mui/material";
import MenuItem from "@mui/material/MenuItem";
import PropertyLabel from "../node/PropertyLabel";
import useModelStore from "../../stores/ModelStore";
import { PropertyProps } from "../node/PropertyInput";
import { TypeName } from "../../stores/ApiTypes";
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
    default:
      return undefined;
  }
}

export function ModelProperty(props: PropertyProps) {
  const id = `folder-${props.property.name}-${props.propertyIndex}`;
  const load = useModelStore((state) => state.load);
  const folder = modelFolder(props.property.type.type);

  const { data, error, isError } = useQuery(
    ["models", folder],
    async () => {
      if (folder === undefined) return [];
      return load(folder);
    },
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
            name: e.target.value
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
        {data && data.map((model) => (
          <MenuItem key={model} value={model}>
            {model}
          </MenuItem>
        ))}
      </Select>
    </>
  );
}

import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import ComfyModelSelect from "./ComfyModelSelect";
import LlamaModelSelect from "./LlamaModelSelect";
import HuggingFaceModelSelect from "./HuggingFaceModelSelect";

export default function ModelProperty(props: PropertyProps) {
  const id = `folder-${props.property.name}-${props.propertyIndex}`;
  const modelType = props.property.type.type;

  const renderModelSelect = () => {
    if (modelType.startsWith("comfy.")) {
      if (props.nodeType.startsWith("comfy.loaders.")) {
        return (
          <ComfyModelSelect
            modelType={modelType}
            onChange={props.onChange}
            value={props.value?.name || ""}
          />
        );
      }
    } else if (modelType === "llama_model") {
      return (
        <LlamaModelSelect
          onChange={props.onChange}
          value={props.value?.repo_id || ""}
        />
      );
    } else if (modelType.startsWith("hf.")) {
      return (
        <HuggingFaceModelSelect
          modelType={modelType}
          onChange={props.onChange}
          value={props.value}
        />
      );
    }
    return null;
  };

  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      {renderModelSelect()}
    </>
  );
}

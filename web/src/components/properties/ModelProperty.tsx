import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import ComfyModelSelect from "./ComfyModelSelect";
import LlamaModelSelect from "./LlamaModelSelect";
import HuggingFaceModelSelect from "./HuggingFaceModelSelect";
import { isEqual } from "lodash";
import { memo, useMemo } from "react";
import OpenAIModelSelect from "./OpenAIModelSelect";
import { useNodes } from "../../contexts/NodeContext";

const ModelProperty = (props: PropertyProps) => {
  const id = `folder-${props.property.name}-${props.propertyIndex}`;
  const modelType = props.property.type.type;
  const edges = useNodes((state) => state.edges);
  const isConnected = useMemo(() => {
    return edges.some(
      (edge) =>
        edge.target === props.nodeId &&
        edge.targetHandle === props.property.name
    );
  }, [edges, props.nodeId, props.property.name]);

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
    } else if (modelType === "openai_model") {
      return (
        <OpenAIModelSelect
          onChange={props.onChange}
          value={props.value?.id || ""}
        />
      );
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
    <div className="model-property">
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      {!isConnected && renderModelSelect()}
    </div>
  );
};

export default memo(ModelProperty, isEqual);

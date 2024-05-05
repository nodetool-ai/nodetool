/** @jsxImportSource @emotion/react */
import { useCallback, createElement } from "react";
import { useReactFlow } from "reactflow";
import { NodeData } from "../../stores/NodeData";
import { Property, TypeName } from "../../stores/ApiTypes";
import { useNodeStore } from "../../stores/NodeStore";
import PropertyLabel from "./PropertyLabel";
import useContextMenuStore from "../../stores/ContextMenuStore";
import reduceUnionType from "../../hooks/reduceUnionType";
import { StringProperty } from "../properties/StringProperty";
import { TextProperty } from "../properties/TextProperty";
import { ImageProperty } from "../properties/ImageProperty";
import { AudioProperty } from "../properties/AudioProperty";
import { VideoProperty } from "../properties/VideoProperty";
import { IntegerProperty } from "../properties/IntegerProperty";
import { FloatProperty } from "../properties/FloatProperty";
import { EnumProperty } from "../properties/EnumProperty";
import { BoolProperty } from "../properties/BoolProperty";
import { ListProperty } from "../properties/ListProperty";
import { ThreadMessageProperty } from "../properties/ThreadMessageProperty";
import { FileProperty } from "../properties/FileProperty";
import { AssetProperty } from "../properties/AssetProperty";
import { FolderProperty } from "../properties/FolderProperty";
import { ModelProperty } from "../properties/ModelProperty";
import { WorkflowProperty } from "../properties/WorkflowProperty";
import { NodeListProperty } from "../properties/NodeListProperty";
import { WorkflowListProperty } from "../properties/WorkflowListProperty";
import { NonEditableProperty } from "../properties/NonEditableProperty";

export type PropertyProps = {
  property: Property;
  value: any;
  propertyIndex: string;
  isInspector?: boolean;
  onChange: (value: any) => void;
};

function InputProperty(props: PropertyProps) {
  const id = `edge-${props.property.name}-${props.propertyIndex}`;

  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
    </>
  );
}

const componentTypeMap: Record<string, (props: PropertyProps) => JSX.Element> =
  {
    str: StringProperty,
    text: TextProperty,
    image: ImageProperty,
    audio: AudioProperty,
    video: VideoProperty,
    int: IntegerProperty,
    float: FloatProperty,
    enum: EnumProperty,
    bool: BoolProperty,
    list: ListProperty,
    thread: NonEditableProperty,
    thread_message: ThreadMessageProperty,
    file: FileProperty,
    folder: FolderProperty,
    asset: AssetProperty,
    workflow: WorkflowProperty,
    function_model: ModelProperty,
    language_model: ModelProperty,
    llama_model: ModelProperty,
    "comfy.checkpoint_file": ModelProperty,
    "comfy.vae_file": ModelProperty,
    "comfy.clip_file": ModelProperty,
    "comfy.unclip_file": ModelProperty,
    "comfy.gligen_file": ModelProperty,
    "comfy.clip_vision_file": ModelProperty,
    "comfy.control_net_file": ModelProperty,
    "comfy.ip_adapter_file": ModelProperty,
    "comfy.upscale_model_file": ModelProperty,
    "comfy.lora_file": ModelProperty
  };

function componentFor(
  property: Property
): React.ComponentType<PropertyProps> | null {
  const type = property.type.type;

  if (type === "union") {
    const reducedType = reduceUnionType(property.type);
    if (!(reducedType in componentTypeMap)) {
      return InputProperty;
    }
    return componentTypeMap[reducedType as TypeName];
  } else if (type === "list") {
    const type_args = property.type?.type_args;

    if (type_args && type_args?.length > 0) {
      switch (type_args[0].type) {
        case "workflow":
          return WorkflowListProperty;
        case "node":
          return NodeListProperty;
      }
    }
    return ListProperty;
  } else {
    if (!(type in componentTypeMap)) {
      return InputProperty;
    }
    return componentTypeMap[type];
  }
}

export type PropertyInputProps = {
  id: string;
  data: NodeData;
  property: Property;
  propertyIndex?: string;
  controlKeyPressed?: boolean;
  isInspector?: boolean;
  hideInput: boolean;
};

const PropertyInput: React.FC<PropertyInputProps> = (props) => {
  const data = props.data;
  const property = props.property;
  const { setNodes } = useReactFlow();
  const invalidateResults = useNodeStore((state) => state.invalidateResults);
  const value = data.properties[property.name];

  const onChange = useCallback(
    (value: any) => {
      invalidateResults(props.id);
      setNodes((prevNodes) => {
        const node = prevNodes.find((n) => n.id === props.id);
        if (node && node.data.properties[property.name] !== value) {
          const updatedNode = {
            ...node,
            data: {
              ...node.data,
              properties: {
                ...node.data.properties,
                [property.name]: value
              }
            }
          };
          return prevNodes.map((n) => (n.id === props.id ? updatedNode : n));
        }
        return prevNodes;
      });
    },
    [invalidateResults, property.name, props.id, setNodes]
  );

  const controlKeyPressed = props.controlKeyPressed || false;
  const propertyIndex = props.propertyIndex || "";
  const propertyProps = {
    property: property,
    value: value,
    propertyIndex: propertyIndex,
    onChange: onChange
  };

  // Property Context Menu
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const handlePropertyContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>, prop: Property) => {
      event.preventDefault();
      event.stopPropagation();
      openContextMenu(
        "property-context-menu",
        props.id,
        event.clientX,
        event.clientY,
        "node-property"
      );
    },
    [openContextMenu, props.id]
  );

  // Reset property to default value
  const onContextMenu: React.MouseEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    if (controlKeyPressed) {
      onChange(props.property.default);
    } else {
      handlePropertyContextMenu(event, props.property);
    }
  };

  if (props.hideInput) {
    return (
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={props.id}
      />
    );
  }

  const className =
    value === props.property.default ? "value-default" : "value-changed";

  const componentType = componentFor(property);
  let inputField = null;
  if (componentType) {
    inputField = createElement(componentType, propertyProps);
  } else {
    inputField = <div>Unsupported property type</div>;
  }

  return (
    <div className={className} onContextMenu={onContextMenu}>
      {inputField}
    </div>
  );
};

export default PropertyInput;

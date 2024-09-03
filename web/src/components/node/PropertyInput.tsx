/** @jsxImportSource @emotion/react */
import React, { useCallback, createElement, useMemo } from "react";
import { NodeData } from "../../stores/NodeData";
import { Property, TypeName } from "../../stores/ApiTypes";
import { useNodeStore } from "../../stores/NodeStore";
import PropertyLabel from "./PropertyLabel";
import useContextMenuStore from "../../stores/ContextMenuStore";
import reduceUnionType from "../../hooks/reduceUnionType";
import StringProperty from "../properties/StringProperty";
import TextProperty from "../properties/TextProperty";
import ImageProperty from "../properties/ImageProperty";
import AudioProperty from "../properties/AudioProperty";
import VideoProperty from "../properties/VideoProperty";
import IntegerProperty from "../properties/IntegerProperty";
import FloatProperty from "../properties/FloatProperty";
import EnumProperty from "../properties/EnumProperty";
import BoolProperty from "../properties/BoolProperty";
import ListProperty from "../properties/ListProperty";
import ThreadMessageProperty from "../properties/ThreadMessageProperty";
import FileProperty from "../properties/FileProperty";
import AssetProperty from "../properties/AssetProperty";
import FolderProperty from "../properties/FolderProperty";
import ModelProperty from "../properties/ModelProperty";
import WorkflowProperty from "../properties/WorkflowProperty";
import NodeListProperty from "../properties/NodeListProperty";
import WorkflowListProperty from "../properties/WorkflowListProperty";
import NonEditableProperty from "../properties/NonEditableProperty";
import DataframeProperty from "../properties/DataframeProperty";
import DictProperty from "../properties/DictProperty";
import RecordTypeProperty from "../properties/RecordTypeProperty";

export type PropertyProps = {
  property: Property;
  value: any;
  nodeType: string;
  hideLabel?: boolean;
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

/**
 * Map of property type to component.
 *
 * The key is the property type, and the value is the component that renders the property.
 */
const componentTypeMap: Record<string, React.ComponentType<PropertyProps>> = {
  str: StringProperty,
  text: TextProperty,
  image: ImageProperty,
  audio: AudioProperty,
  video: VideoProperty,
  int: IntegerProperty,
  float: FloatProperty,
  enum: EnumProperty,
  bool: BoolProperty,
  dict: DictProperty,
  thread: NonEditableProperty,
  thread_message: ThreadMessageProperty,
  file: FileProperty,
  folder: FolderProperty,
  asset: AssetProperty,
  workflow: WorkflowProperty,
  function_model: ModelProperty,
  language_model: ModelProperty,
  llama_model: ModelProperty,
  dataframe: DataframeProperty,
  record_type: RecordTypeProperty,
  "comfy.checkpoint_file": ModelProperty,
  "comfy.vae_file": ModelProperty,
  "comfy.clip_file": ModelProperty,
  "comfy.unclip_file": ModelProperty,
  "comfy.gligen_file": ModelProperty,
  "comfy.clip_vision_file": ModelProperty,
  "comfy.control_net_file": ModelProperty,
  "comfy.ip_adapter_file": ModelProperty,
  "comfy.upscale_model_file": ModelProperty,
  "comfy.lora_file": ModelProperty,
  "comfy.unet_file": ModelProperty,
  "comfy.instant_id_file": ModelProperty
};

/**
 * Get the component for the property.
 *
 * @param property The property.
 * @returns The component for the property.
 * @returns null if the property type is not supported.
 * @returns InputProperty if the property type is supported.
 */
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

/**
 * Properties for the PropertyInput component.
 */
export type PropertyInputProps = {
  id: string;
  nodeType: string;
  data: NodeData;
  property: Property;
  propertyIndex?: string;
  controlKeyPressed?: boolean;
  isInspector?: boolean;
  hideInput: boolean;
  hideLabel: boolean;
};

const PropertyInput: React.FC<PropertyInputProps> = React.memo(
  ({
    id,
    nodeType,
    data,
    property,
    propertyIndex,
    controlKeyPressed,
    hideInput
  }: PropertyInputProps) => {
    const updateNodeProperties = useNodeStore(
      (state) => state.updateNodeProperties
    );
    const value = data.properties[property.name];

    const onChange = useCallback(
      (value: any) => {
        updateNodeProperties(id, { [property.name]: value });
      },
      [id, property.name, updateNodeProperties]
    );

    const propertyProps = useMemo(
      () => ({
        property: property,
        value: value,
        propertyIndex: propertyIndex || "",
        nodeType: nodeType,
        onChange: onChange
      }),
      [property, value, propertyIndex, nodeType, onChange]
    );

    // Property Context Menu
    const openContextMenu = useContextMenuStore(
      (state) => state.openContextMenu
    );
    const handlePropertyContextMenu = useCallback(
      (event: React.MouseEvent<HTMLDivElement>, prop: Property) => {
        event.preventDefault();
        event.stopPropagation();
        openContextMenu(
          "property-context-menu",
          id,
          event.clientX,
          event.clientY,
          "node-property"
        );
      },
      [id, openContextMenu]
    );

    // Reset property to default value
    const onContextMenu = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (controlKeyPressed) {
          onChange(property.default);
        } else {
          handlePropertyContextMenu(event, property);
        }
      },
      [controlKeyPressed, onChange, property, handlePropertyContextMenu]
    );

    if (hideInput) {
      return (
        <PropertyLabel
          name={property.name}
          description={property.description}
          id={id}
        />
      );
    }

    const className =
      value === property.default ? "value-default" : "value-changed";

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
  }
);

PropertyInput.displayName = "PropertyInput";

export default PropertyInput;

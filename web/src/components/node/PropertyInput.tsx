/** @jsxImportSource @emotion/react */
import React, { useCallback, createElement, memo } from "react";
import { Property } from "../../stores/ApiTypes";
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
import WorkflowProperty from "../properties/WorkflowProperty";
import WorkflowListProperty from "../properties/WorkflowListProperty";
import NonEditableProperty from "../properties/NonEditableProperty";
import DataframeProperty from "../properties/DataframeProperty";
import DictProperty from "../properties/DictProperty";
import RecordTypeProperty from "../properties/RecordTypeProperty";
import ModelProperty from "../properties/ModelProperty";
import { isEqual } from "lodash";
import ColorProperty from "../properties/ColorProperty";

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

const basicComponentTypeMap: Record<
  string,
  React.ComponentType<PropertyProps>
> = {
  str: StringProperty,
  text: TextProperty,
  int: IntegerProperty,
  float: FloatProperty,
  bool: BoolProperty,
  dict: DictProperty,
  color: ColorProperty
};

function getComponentForType(
  property: Property
): React.ComponentType<PropertyProps> {
  const type = property.type.type;

  if (type in basicComponentTypeMap) {
    return basicComponentTypeMap[type];
  }

  return handleAdvancedDataTypes(property);
}

function handleAdvancedDataTypes(
  property: Property
): React.ComponentType<PropertyProps> {
  const type = property.type.type;

  switch (type) {
    case "image":
      return ImageProperty;
    case "audio":
      return AudioProperty;
    case "video":
      return VideoProperty;
    case "enum":
      return EnumProperty;
    case "thread":
      return NonEditableProperty;
    case "thread_message":
      return ThreadMessageProperty;
    case "file":
      return FileProperty;
    case "folder":
      return FolderProperty;
    case "asset":
      return AssetProperty;
    case "workflow":
      return WorkflowProperty;
    case "dataframe":
      return DataframeProperty;
    case "record_type":
      return RecordTypeProperty;
    case "union":
      return handleUnionType(property);
    case "list":
      return handleListType(property);
    default:
      return handleModelTypes(type);
  }
}

function handleUnionType(
  property: Property
): React.ComponentType<PropertyProps> {
  const reducedType = reduceUnionType(property.type);
  return getComponentForType({ ...property, type: { type: reducedType } });
}

function handleListType(
  property: Property
): React.ComponentType<PropertyProps> {
  const type_args = property.type?.type_args;

  if (type_args && type_args.length > 0) {
    switch (type_args[0].type) {
      case "workflow":
        return WorkflowListProperty;
    }
  }
  return ListProperty;
}

function handleModelTypes(type: string): React.ComponentType<PropertyProps> {
  const modelPrefixes = [
    "function_model",
    "language_model",
    "llama_model",
    "comfy.",
    "hf."
  ];

  for (const prefix of modelPrefixes) {
    if (type.startsWith(prefix)) {
      return ModelProperty;
    }
  }

  return InputProperty;
}

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
  return getComponentForType(property);
}

/**
 * Properties for the PropertyInput component.
 */
export type PropertyInputProps = {
  id: string;
  nodeType: string;
  value: any;
  property: Property;
  propertyIndex?: string;
  controlKeyPressed?: boolean;
  isInspector?: boolean;
  hideInput: boolean;
  hideLabel: boolean;
};

const PropertyInput: React.FC<PropertyInputProps> = ({
  id,
  nodeType,
  value,
  property,
  propertyIndex,
  controlKeyPressed,
  hideInput
}: PropertyInputProps) => {
  const onChange = useCallback(
    (value: any) => {
      const updateNodeProperties = useNodeStore.getState().updateNodeProperties;
      updateNodeProperties(id, { [property.name]: value });
    },
    [id, property.name]
  );

  const propertyProps = {
    property: property,
    value: value,
    propertyIndex: propertyIndex || "",
    nodeType: nodeType,
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
};

export default memo(PropertyInput, isEqual);

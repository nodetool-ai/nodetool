/** @jsxImportSource @emotion/react */
import React, { useCallback, createElement, memo } from "react";
import { Property } from "../../stores/ApiTypes";
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
import FilePathProperty from "../properties/FilePathProperty";
import CollectionProperty from "../properties/CollectionProperty";
import FolderPathProperty from "../properties/FolderPathProperty";
import DocumentProperty from "../properties/DocumentProperty";
import Close from "@mui/icons-material/Close";
import Edit from "@mui/icons-material/Edit";
import { css } from "@emotion/react";
import { useNodes } from "../../contexts/NodeContext";

export type PropertyProps = {
  property: Property;
  value: any;
  nodeType: string;
  nodeId: string;
  hideLabel?: boolean;
  propertyIndex: string;
  isInspector?: boolean;
  onChange: (value: any) => void;
  tabIndex?: number;
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
    case "collection":
      return CollectionProperty;
    case "document":
      return DocumentProperty;
    case "enum":
      return EnumProperty;
    case "thread":
      return NonEditableProperty;
    case "thread_message":
      return ThreadMessageProperty;
    case "file":
      return FileProperty;
    case "file_path":
      return FilePathProperty;
    case "folder_path":
      return FolderPathProperty;
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
  return getComponentForType({
    ...property,
    type: {
      type: reducedType,
      optional: property.type.optional,
      type_args: property.type.type_args,
      type_name: property.type.type_name
    }
  });
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
    "openai_model",
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
  tabIndex?: number;
  isDynamicProperty?: boolean;
  onUpdateProperty?: (property: string, value: any) => void;
  onDeleteProperty?: (property: string) => void;
  onUpdatePropertyName?: (oldName: string, newName: string) => void;
};

const PropertyInput: React.FC<PropertyInputProps> = ({
  id,
  nodeType,
  value,
  property,
  propertyIndex,
  controlKeyPressed,
  tabIndex,
  isDynamicProperty,
  onDeleteProperty,
  onUpdateProperty,
  onUpdatePropertyName
}: PropertyInputProps) => {
  const { updateNodeProperties, findNode, updateNodeData } = useNodes(
    (state) => ({
      updateNodeProperties: state.updateNodeProperties,
      updateNodeData: state.updateNodeData,
      findNode: state.findNode
    })
  );
  const onChange = useCallback(
    (value: any) => {
      if (isDynamicProperty) {
        const node = findNode(id);
        const dynamicProperties = node?.data.dynamic_properties;
        const updatedDynamicProperties = {
          ...dynamicProperties,
          [property.name]: value
        };
        updateNodeData(id, {
          dynamic_properties: updatedDynamicProperties
        });
      } else {
        updateNodeProperties(id, { [property.name]: value });
      }
    },
    [id, property.name, isDynamicProperty, findNode, updateNodeProperties]
  );

  const propertyProps = {
    property: property,
    value: value,
    propertyIndex: propertyIndex || "",
    nodeType: nodeType,
    nodeId: id,
    onChange: onChange,
    tabIndex: tabIndex
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
        "node-property",
        prop.type,
        prop.name,
        prop.description || undefined,
        isDynamicProperty
      );
    },
    [id, openContextMenu]
  );

  // Reset property to default value
  // const onContextMenu = useCallback(
  //   (event: React.MouseEvent<HTMLDivElement>) => {
  //     event.preventDefault();
  //     if (controlKeyPressed) {
  //       onChange(property.default);
  //     } else {
  //       handlePropertyContextMenu(event, property);
  //     }
  //   },
  //   [controlKeyPressed, onChange, property, handlePropertyContextMenu]
  // );

  const className =
    value === property.default ? "value-default" : "value-changed";

  const [isEditingName, setIsEditingName] = React.useState(false);
  const [editedName, setEditedName] = React.useState(property.name);

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editedName && editedName !== property.name) {
      onUpdatePropertyName?.(property.name, editedName);
    }
    setIsEditingName(false);
  };

  const componentType = componentFor(property);

  let inputField = null;
  if (componentType) {
    if (isDynamicProperty && isEditingName) {
      inputField = (
        <form onSubmit={handleNameSubmit} className="property-input-form">
          <input
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleNameSubmit}
            autoFocus
          />
        </form>
      );
    } else {
      inputField = createElement(componentType, propertyProps);
    }
  } else {
    inputField = <div>Unsupported property type</div>;
  }

  const textStyles = (theme: any) =>
    css({
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      lineHeight: "1.2",
      color: theme.palette.c_white
    });

  return (
    <div
      className={`${className} property-input-container`}
      // onContextMenu={onContextMenu}
    >
      {inputField}
      {(isDynamicProperty || onDeleteProperty) && !isEditingName && (
        <div className="action-icons">
          {isDynamicProperty && (
            <Edit
              className="action-icon"
              onClick={() => setIsEditingName(true)}
            />
          )}
          {onDeleteProperty && (
            <Close
              className="action-icon close"
              onClick={() => onDeleteProperty(property.name)}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default memo(PropertyInput, isEqual);

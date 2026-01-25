/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, createElement, memo } from "react";
import { Property } from "../../stores/ApiTypes";
import PropertyLabel from "./PropertyLabel";
import useContextMenu from "../../stores/ContextMenuStore";
import reduceUnionType from "../../hooks/reduceUnionType";
import StringProperty from "../properties/StringProperty";
import TextProperty from "../properties/TextProperty";
import ImageProperty from "../properties/ImageProperty";
import AudioProperty from "../properties/AudioProperty";
import VideoProperty from "../properties/VideoProperty";
import Model3DProperty from "../properties/Model3DProperty";
import IntegerProperty from "../properties/IntegerProperty";
import FloatProperty from "../properties/FloatProperty";
import EnumProperty from "../properties/EnumProperty";
import BoolProperty from "../properties/BoolProperty";
import ListProperty from "../properties/ListProperty";
import FileProperty from "../properties/FileProperty";
import AssetProperty from "../properties/AssetProperty";
import FolderProperty from "../properties/FolderProperty";
import WorkflowProperty from "../properties/WorkflowProperty";
import WorkflowListProperty from "../properties/WorkflowListProperty";
import ToolsListProperty from "../properties/ToolsListProperty";
import DataframeProperty from "../properties/DataframeProperty";
import DictProperty from "../properties/DictProperty";
import RecordTypeProperty from "../properties/RecordTypeProperty";
import ModelProperty from "../properties/ModelProperty";
import isEqual from "lodash/isEqual";
import ColorProperty from "../properties/ColorProperty";
import FilePathProperty from "../properties/FilePathProperty";
import CollectionProperty from "../properties/CollectionProperty";
import FolderPathProperty from "../properties/FolderPathProperty";
import DocumentProperty from "../properties/DocumentProperty";
import FontProperty from "../properties/FontProperty";
import SelectProperty from "../properties/SelectProperty";
import Close from "@mui/icons-material/Close";
import Edit from "@mui/icons-material/Edit";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useNodes } from "../../contexts/NodeContext";
import JSONProperty from "../properties/JSONProperty";
import StringListProperty from "../properties/StringListProperty";
import useMetadataStore from "../../stores/MetadataStore";
import InferenceProviderModelSelect from "../properties/InferenceProviderModelSelect";
import { useDynamicProperty } from "../../hooks/nodes/useDynamicProperty";
import { NodeData } from "../../stores/NodeData";
import { useInputNodeAutoRun } from "../../hooks/nodes/useInputNodeAutoRun";

const propertyInputContainerStyles = (theme: Theme) =>
  css({
    "&.property-input-container": {
      position: "relative"
    },

    // ACTION ICONS
    "&:hover .action-icons": {
      opacity: 1
    },

    ".action-icon": {
      fontSize: "1.2em",
      cursor: "pointer",
      margin: "0.2em 0.2em 0.2em 0.5em"
    },

    ".action-icon.close": {
      margin: "0.2em 0.5em 0.2em 0"
    },

    // INPUT FORM
    ".property-input-form": {
      display: "inline"
    },

    ".property-input-form input": {
      padding: "2px 4px",
      border: `1px solid ${theme.vars.palette.grey[500]}`,
      borderRadius: "3px",
      background: "transparent",
      color: "inherit",
      fontSize: "inherit"
    }
  });

export type PropertyProps = {
  property: Property;
  value: any;
  nodeType: string;
  nodeId: string;
  hideLabel?: boolean;
  propertyIndex: string;
  isInspector?: boolean;
  onChange: (value: any) => void;
  /**
   * Called when the user finishes changing the value (e.g., on mouseup for sliders).
   * Useful for triggering actions only when the user has committed their change.
   */
  onChangeComplete?: () => void;
  tabIndex?: number;
  isDynamicProperty?: boolean;
  /**
   * Value differs from default — shows visual indicator
   */
  changed?: boolean;
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

function getComponentForProperty(
  property: Property
): React.ComponentType<PropertyProps> {
  if (property.json_schema_extra?.type) {
    return componentForType(property.json_schema_extra.type as string);
  } else {
    switch (property.type.type) {
      case "union":
        return handleUnionType(property);
      case "list":
        return handleListType(property);
      default:
        return componentForType(property.type.type);
    }
  }
}

function componentForType(type: string): React.ComponentType<PropertyProps> {
  switch (type) {
    case "str":
      return StringProperty;
    case "text":
      return TextProperty;
    case "int":
      return IntegerProperty;
    case "float":
      return FloatProperty;
    case "bool":
      return BoolProperty;
    case "dict":
      return DictProperty;
    case "color":
      return ColorProperty;
    case "image":
      return ImageProperty;
    case "audio":
      return AudioProperty;
    case "video":
      return VideoProperty;
    case "model_3d":
      return Model3DProperty;
    case "collection":
      return CollectionProperty;
    case "json":
      return JSONProperty;
    case "document":
      return DocumentProperty;
    case "enum":
      return EnumProperty;
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
    case "select":
      return SelectProperty;
    case "workflow":
      return WorkflowProperty;
    case "dataframe":
      return DataframeProperty;
    case "record_type":
      return RecordTypeProperty;
    case "font":
      return FontProperty;
    case "inference_provider_automatic_speech_recognition_model":
    case "inference_provider_audio_classification_model":
    case "inference_provider_image_classification_model":
    case "inference_provider_text_classification_model":
    case "inference_provider_summarization_model":
    case "inference_provider_text_to_image_model":
    case "inference_provider_translation_model":
    case "inference_provider_text_to_text_model":
    case "inference_provider_text_to_speech_model":
    case "inference_provider_text_to_audio_model":
    case "inference_provider_text_generation_model":
    case "inference_provider_image_to_image_model":
    case "inference_provider_image_segmentation_model":
      return InferenceProviderModelSelect;
    default:
      return handleModelTypes(type);
  }
}

function handleUnionType(
  property: Property
): React.ComponentType<PropertyProps> {
  const reducedType = reduceUnionType(property.type);
  return getComponentForProperty({
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
      case "tool_name":
        return ToolsListProperty;
      case "str":
        return StringListProperty;
    }
  }
  return ListProperty;
}

function handleModelTypes(type: string): React.ComponentType<PropertyProps> {
  const modelPrefixes = ["comfy.", "hf."];

  if (type.endsWith("_model")) {
    return ModelProperty;
  }

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
  return getComponentForProperty(property);
}

/**
 * Properties for the PropertyInput component.
 */
export type PropertyInputProps = {
  id: string;
  nodeType: string;
  data: NodeData;
  value: any;
  property: Property;
  propertyIndex?: string;
  controlKeyPressed?: boolean;
  isInspector?: boolean;
  tabIndex?: number;
  isDynamicProperty?: boolean;
  onValueChange?: (value: any) => void;
};

const PropertyInput: React.FC<PropertyInputProps> = ({
  id,
  nodeType,
  data,
  value,
  property,
  propertyIndex,
  controlKeyPressed,
  tabIndex,
  isDynamicProperty,
  isInspector,
  onValueChange
}: PropertyInputProps) => {
  const theme = useTheme();
  const { updateNodeProperties, findNode, updateNodeData } = useNodes(
    (state) => ({
      updateNodeProperties: state.updateNodeProperties,
      updateNodeData: state.updateNodeData,
      findNode: state.findNode
    })
  );
  const metadata = useMetadataStore((state) => state.metadata);

  // Auto-run hook for input nodes - triggers downstream workflow execution on property changes
  const { onPropertyChange, onPropertyChangeComplete } = useInputNodeAutoRun({
    nodeId: id,
    nodeType,
    propertyName: property.name
  });

  const onChange = useCallback(
    (value: any) => {
      if (onValueChange) {
        onValueChange(value);
        return;
      }
      if (isDynamicProperty) {
        const node = findNode(id);
        if (!node || !node.data) {
          return;
        }

        const dynamicProperties = node.data.dynamic_properties || {};
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

      // Trigger auto-run (hook decides based on settings and node type)
      onPropertyChange();
    },
    [
      findNode,
      id,
      isDynamicProperty,
      onPropertyChange,
      onValueChange,
      property.name,
      updateNodeData,
      updateNodeProperties
    ]
  );

  // Calculate changed state: value differs from default
  const isChanged = value !== property.default;

  // Handle slider/number input change complete
  const handleChangeComplete = useCallback(() => {
    onPropertyChangeComplete();
  }, [onPropertyChangeComplete]);

  const propertyProps = {
    property: property,
    value: value,
    propertyIndex: propertyIndex || "",
    nodeType: nodeType,
    nodeId: id,
    onChange: onChange,
    onChangeComplete: handleChangeComplete,
    tabIndex: tabIndex,
    isDynamicProperty: isDynamicProperty,
    isInspector: isInspector,
    changed: isChanged
  };

  // Property Context Menu
  const { openContextMenu } = useContextMenu();
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
    [id, isDynamicProperty, openContextMenu]
  );

  // Reset property to default value
  const onContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (controlKeyPressed) {
        // Reset to default value with Ctrl+Right-click
        const node = findNode(id);
        if (!node || !node.data) {
          return;
        }

        if (isDynamicProperty) {
          // For dynamic properties, get default from metadata
          const nodeMetadata = metadata?.[node.type as string];
          if (nodeMetadata) {
            const propertyDef = nodeMetadata.properties.find(
              (prop: Property) => prop.name === property.name
            );
            if (propertyDef && node.data.dynamic_properties) {
              const updatedDynamicProperties = {
                ...node.data.dynamic_properties,
                [property.name]: propertyDef.default
              };
              updateNodeData(id, {
                dynamic_properties: updatedDynamicProperties
              });
            }
          }
        } else {
          // For regular properties, get default from metadata or property
          const nodeMetadata = metadata?.[node.type as string];
          if (nodeMetadata) {
            const propertyDef = nodeMetadata.properties.find(
              (prop: Property) => prop.name === property.name
            );
            const defaultValue = propertyDef?.default ?? property.default;
            updateNodeProperties(id, { [property.name]: defaultValue });
          } else {
            // Fallback to property.default if metadata not available
            updateNodeProperties(id, { [property.name]: property.default });
          }
        }
      } else {
        handlePropertyContextMenu(event, property);
      }
    },
    [
      controlKeyPressed,
      findNode,
      id,
      isDynamicProperty,
      metadata,
      property,
      updateNodeData,
      updateNodeProperties,
      handlePropertyContextMenu
    ]
  );

  const [isEditingName, setIsEditingName] = React.useState(false);
  const [editedName, setEditedName] = React.useState(property.name);
  const { handleDeleteProperty, handleUpdatePropertyName } = useDynamicProperty(
    id,
    (data?.dynamic_properties as Record<string, any>) || {}
  );

  const handleNameSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (editedName && editedName !== property.name) {
        handleUpdatePropertyName(property.name, editedName);
      }
      setIsEditingName(false);
    },
    [handleUpdatePropertyName, property.name, editedName]
  );

  const componentType = componentFor(property);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditedName(e.target.value);
  }, []);

  let inputField: React.ReactNode = null;
  if (componentType) {
    if (isDynamicProperty && isEditingName) {
      inputField = (
        <form onSubmit={handleNameSubmit} className="property-input-form">
          <input
            value={editedName}
            onChange={handleNameChange}
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
  const handleDoubleClick = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDynamicProperty) {
        return;
      }
      const target = e.target as HTMLElement;
      if (target && target.closest && target.closest(".property-label")) {
        e.stopPropagation();
        setEditedName(property.name);
        setIsEditingName(true);
      }
    },
    [isDynamicProperty, property.name]
  );

  const handleEditNameClick = useCallback(() => {
    setIsEditingName(true);
  }, []);

  const handleDeleteClick = useCallback(() => {
    handleDeleteProperty(property.name);
  }, [handleDeleteProperty, property.name]);

  return (
    <div
      className="property-input-container"
      css={propertyInputContainerStyles(theme)}
      onContextMenu={onContextMenu}
      onDoubleClick={handleDoubleClick}
    >
      {inputField}
      {isDynamicProperty && (
        <div className="action-icons">
          <Edit
            className="action-icon"
            onClick={handleEditNameClick}
          />
          <Close
            className="action-icon close"
            onClick={handleDeleteClick}
          />
        </div>
      )}
    </div>
  );
};

export default memo(PropertyInput, isEqual);

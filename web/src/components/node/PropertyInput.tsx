/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, createElement, memo, useMemo } from "react";
import { shallow } from "zustand/shallow";
import { Property } from "../../stores/ApiTypes";
import { PropertyHandleTooltipContext } from "../../contexts/PropertyHandleTooltipContext";
import { useContextMenuActions } from "../../stores/ContextMenuStore";
import StringProperty from "../properties/StringProperty";
import DataframeProperty from "../properties/DataframeProperty";
import isEqual from "../../utils/isEqual";
import { isFieldRelevantDataEqual } from "./propertyFieldEquality";
import Close from "@mui/icons-material/Close";
import Edit from "@mui/icons-material/Edit";
import SettingsBackupRestoreIcon from "@mui/icons-material/SettingsBackupRestore";
import {
  Tooltip,
  ToolbarIconButton,
  MOTION,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx,
  Z_INDEX
} from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useNodes } from "../../contexts/NodeContext";
import JSONProperty from "../properties/JSONProperty";
import useMetadataStore from "../../stores/MetadataStore";
import { useDynamicProperty } from "../../hooks/nodes/useDynamicProperty";
import { NodeData } from "../../stores/NodeData";
import { useInputNodeAutoRun } from "../../hooks/nodes/useInputNodeAutoRun";
import { deriveCodeIOUpdates } from "../../utils/codeOutputInference";
import { InspectorHeaderResetProvider } from "../../contexts/InspectorPropertyHeaderContext";
import { getComponentForProperty } from "./PropertyInput.resolver";
import type { PropertyProps } from "./PropertyInput.types";

export type { PropertyProps } from "./PropertyInput.types";

const RESET_BUTTON_OFFSET_CSS = css({
  "--property-reset-button-offset": "40px"
});

const INLINE_FLEX_STYLE: React.CSSProperties = { display: "inline-flex" };

const propertyInputContainerStyles = (theme: Theme) =>
  css({
    "&.property-input-container": {
      position: "relative",
      minHeight: 0
    },
    // Editor is driven by a connected input edge — dim it and block
    // interaction (the inner `inert` subtree removes it from the tab order).
    ".property-connected-disabled": {
      opacity: 0.5,
      cursor: "not-allowed"
    },
    // Changed-value bar is painted on `.node-property` in properties.css
    // (class kept for :has() + numberInputStyles).
    ".property-reset-anchor": {
      position: "absolute",
      top: 0,
      right: "var(--property-reset-button-offset, 0px)",
      width: 0,
      height: 0,
      overflow: "visible",
      lineHeight: 0,
      fontSize: 0,
      pointerEvents: "none"
    },
    ".property-reset-anchor .reset-button": {
      pointerEvents: "none"
    },
    ".property-reset-anchor .reset-button.is-active": {
      pointerEvents: "auto"
    },

    // ACTION ICONS — hidden by default, shown on hover
    ".action-icons": {
      position: "absolute",
      right: 4,
      top: "50%",
      transform: "translateY(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 4,
      opacity: 0,
      transition: MOTION.opacity,
      zIndex: Z_INDEX.raised,
      background: theme.vars.palette.background.paper,
      borderRadius: BORDER_RADIUS.sm,
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.sm)}`,
      boxShadow: `0 1px 4px ${theme.vars.palette.action.focus}`,
    },

    "&:hover .action-icons, &:hover .reset-button.is-active": {
      opacity: 1
    },

    ".action-icon": {
      fontSize: "var(--fontSizeBig)",
      cursor: "pointer",
      padding: 4,
      borderRadius: BORDER_RADIUS.sm,
      color: theme.vars.palette.text.secondary,
      transition: `color ${MOTION.fast}, background ${MOTION.fast}`,
      "&:hover": {
        color: theme.vars.palette.text.primary,
        background: theme.vars.palette.action.hover,
      },
    },

    ".action-icon.close": {
      "&:hover": {
        color: theme.vars.palette.error.main,
      },
    },

    // RESET BUTTON — shown on hover when value differs from default
    ".reset-button": {
      position: "absolute",
      right: "var(--property-reset-button-offset, 0px)",
      top: 0,
      display: "flex",
      alignItems: "center",
      opacity: 0,
      transition: MOTION.opacity,
      zIndex: Z_INDEX.raised,
      cursor: "pointer",
      padding: getSpacingPx(SPACING.micro), // was 1px
      borderRadius: BORDER_RADIUS.sm,
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        color: theme.vars.palette.primary.main,
      },
      "& svg": {
        fontSize: "var(--fontSizeNormal)",
      },
    },

    // INPUT FORM
    ".property-input-form": {
      display: "inline"
    },

    ".property-input-form input": {
      padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.xs)}`,
      border: `1px solid ${theme.vars.palette.grey[500]}`,
      borderRadius: BORDER_RADIUS.sm,
      background: "transparent",
      color: "inherit",
      fontSize: "inherit"
    }
  });

/** Returns true when the property renders as an image/image-list field that
 * manages its own connected-state display (upstream preview). */
function isImageInputType(property: Property): boolean {
  const t = property.type.type;
  if (t === "image" || t === "image_list") return true;
  if (t === "list" && property.type.type_args?.[0]?.type === "image") return true;
  return false;
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
  value: unknown;
  property: Property;
  propertyIndex?: string;
  isInspector?: boolean;
  /** When the inspector edits multiple nodes, reset/context menu apply to all of these ids. */
  inspectorBatchNodeIds?: readonly string[];
  tabIndex?: number;
  isDynamicProperty?: boolean;
  hideActionIcons?: boolean;
  /** True when an edge is connected to this property's target handle. */
  isConnected?: boolean;
  onValueChange?: (value: unknown) => void;
};

const PropertyInput: React.FC<PropertyInputProps> = ({
  id,
  nodeType,
  data,
  value,
  property,
  propertyIndex,
  tabIndex,
  isDynamicProperty,
  hideActionIcons,
  isInspector,
  inspectorBatchNodeIds,
  isConnected,
  onValueChange
}: PropertyInputProps) => {
  const theme = useTheme();
  const containerCss = useMemo(
    () => propertyInputContainerStyles(theme),
    [theme]
  );
  const { updateNodeProperties, findNode, updateNodeData } = useNodes(
    (state) => ({
      updateNodeProperties: state.updateNodeProperties,
      updateNodeData: state.updateNodeData,
      findNode: state.findNode
    }),
    shallow
  );

  const targetNodeIds = useMemo(
    () =>
      inspectorBatchNodeIds?.length ? [...inspectorBatchNodeIds] : [id],
    [inspectorBatchNodeIds, id]
  );

  // Auto-run hook for input nodes - triggers downstream workflow execution on property changes
  const { onPropertyChange, onPropertyChangeComplete } = useInputNodeAutoRun({
    nodeId: id,
    nodeType,
    propertyName: property.name
  });

  const onChange = useCallback(
    (value: unknown) => {
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

      // Auto-infer dynamic inputs and outputs for Code nodes when the code property changes.
      if (
        property.name === "code" &&
        nodeType === "nodetool.code.Code" &&
        typeof value === "string"
      ) {
        const node = findNode(id);
        const existingDynProps = (node?.data?.dynamic_properties ||
          {}) as Record<string, unknown>;
        updateNodeData(id, deriveCodeIOUpdates(value, existingDynProps));
      }

      // Trigger auto-run (hook decides based on settings and node type)
      onPropertyChange();
    },
    [
      findNode,
      id,
      isDynamicProperty,
      nodeType,
      onPropertyChange,
      onValueChange,
      property.name,
      updateNodeData,
      updateNodeProperties
    ]
  );

  // Calculate changed state: value differs from default
  // Skip if no default is defined — nothing to compare against.
  // Treat null defaults the same as undefined (common in dynamic/FalAI schemas
  // where default is null but initial value is "" or [] or 0).
  const hasResetDefault = property.default != null;
  const isChanged = hasResetDefault && !isEqual(value, property.default);

  // Handle slider/number input change complete
  const handleChangeComplete = useCallback(() => {
    onPropertyChangeComplete();
  }, [onPropertyChangeComplete]);

  // Property Context Menu
  const { openContextMenu } = useContextMenuActions();
  const handlePropertyContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>, prop: Property) => {
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
        isDynamicProperty,
        targetNodeIds.length > 1 ? { inspectorBatchNodeIds: targetNodeIds } : undefined
      );
    },
    [id, isDynamicProperty, openContextMenu, targetNodeIds]
  );

  const handleResetToDefault = useCallback(() => {
    const metadata = useMetadataStore.getState().metadata;
    for (const nodeId of targetNodeIds) {
      const node = findNode(nodeId);
      if (!node?.data) {
        continue;
      }
      if (isDynamicProperty) {
        const dynamicInputDefaults = node.data.dynamic_inputs || {};
        let defaultValue = dynamicInputDefaults?.[property.name]?.default;
        if (defaultValue === undefined) {
          const nodeMetadata = node.type ? metadata?.[node.type] : undefined;
          if (nodeMetadata) {
            const propertyDef = nodeMetadata.properties.find(
              (prop: Property) => prop.name === property.name
            );
            defaultValue = propertyDef?.default ?? property.default;
          }
        }
        if (defaultValue !== undefined && node.data.dynamic_properties) {
          updateNodeData(nodeId, {
            dynamic_properties: {
              ...node.data.dynamic_properties,
              [property.name]: defaultValue
            }
          });
        }
      } else {
        const nodeMetadata = node.type ? metadata?.[node.type] : undefined;
        if (nodeMetadata) {
          const propertyDef = nodeMetadata.properties.find(
            (prop: Property) => prop.name === property.name
          );
          const defaultValue = propertyDef?.default ?? property.default;
          updateNodeProperties(nodeId, { [property.name]: defaultValue });
        } else {
          updateNodeProperties(nodeId, { [property.name]: property.default });
        }
      }
    }
  }, [
    findNode,
    isDynamicProperty,
    property,
    targetNodeIds,
    updateNodeData,
    updateNodeProperties
  ]);

  const handleResetKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleResetToDefault();
      }
    },
    [handleResetToDefault]
  );

  const onContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.ctrlKey || event.metaKey) {
        if (isChanged) {
          handleResetToDefault();
        }
      } else {
        handlePropertyContextMenu(event, property);
      }
    },
    [
      handlePropertyContextMenu,
      handleResetToDefault,
      isChanged,
      property
    ]
  );

  const propertyProps: PropertyProps = {
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
    changed: isChanged,
    onPropertyContextMenu: onContextMenu,
    isConnected: isConnected,
    workflowId: data.workflow_id
  };

  const [isEditingName, setIsEditingName] = React.useState(false);
  const [editedName, setEditedName] = React.useState(property.name);
  const { handleDeleteProperty, handleUpdatePropertyName } = useDynamicProperty(
    id,
    (data?.dynamic_properties as Record<string, unknown>) || {}
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
            aria-label="Property name"
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

  const hasTopRightPropertyActions =
    componentType === StringProperty ||
    componentType === JSONProperty ||
    componentType === DataframeProperty;

  const canvasResetButton =
    !isInspector && hasResetDefault ? (
      <Tooltip
        title="Reset to default"
        placement="top"
        disableInteractive
        disabled={!isChanged}
      >
        <span className="property-reset-anchor">
          <div
            className={`reset-button${isChanged ? " is-active" : ""}`}
            role={isChanged ? "button" : undefined}
            tabIndex={isChanged ? 0 : undefined}
            onClick={isChanged ? handleResetToDefault : undefined}
            onKeyDown={isChanged ? handleResetKeyDown : undefined}
            aria-hidden={!isChanged}
          >
            <SettingsBackupRestoreIcon />
          </div>
        </span>
      </Tooltip>
    ) : null;

  const inspectorResetSx = useMemo(
    () =>
      isChanged
        ? { color: theme.vars.palette.common.white }
        : {
            color: theme.vars.palette.text.disabled,
            "&.Mui-disabled": {
              opacity: 0.5,
              color: theme.vars.palette.text.disabled
            }
          },
    [isChanged, theme]
  );

  const inspectorResetButton =
    isInspector && hasResetDefault ? (
      <Tooltip title="Reset to default" placement="top" disableInteractive>
        <span className="inspector-reset-tooltip" style={INLINE_FLEX_STYLE}>
          <ToolbarIconButton
            className={`inspector-reset-button${isChanged ? " is-changed" : ""}`}
            onClick={handleResetToDefault}
            disabled={!isChanged}
            size="small"
            icon={<SettingsBackupRestoreIcon />}
            sx={inspectorResetSx}
          />
        </span>
      </Tooltip>
    ) : null;

  const container = (
    <div
      className={`property-input-container${isChanged ? " value-changed" : ""}`}
      css={[
        containerCss,
        hasTopRightPropertyActions && !isInspector && RESET_BUTTON_OFFSET_CSS
      ]}
      onContextMenu={onContextMenu}
      onDoubleClick={handleDoubleClick}
    >
      <PropertyHandleTooltipContext.Provider value={property.type}>
        {isConnected && !isImageInputType(property) ? (
          <div
            className="property-connected-disabled"
            title="Driven by a connected input — disconnect the edge to edit"
          >
            <div inert>{inputField}</div>
          </div>
        ) : (
          inputField
        )}
      </PropertyHandleTooltipContext.Provider>
      {canvasResetButton}
      {isDynamicProperty && !hideActionIcons && (
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

  if (!isInspector) {
    return container;
  }

  return (
    <InspectorHeaderResetProvider reset={inspectorResetButton}>
      {container}
    </InspectorHeaderResetProvider>
  );
};

export default memo(PropertyInput, (prev, next) => {
  if (
    prev.id !== next.id ||
    prev.nodeType !== next.nodeType ||
    prev.propertyIndex !== next.propertyIndex ||
    prev.isInspector !== next.isInspector ||
    prev.tabIndex !== next.tabIndex ||
    prev.isDynamicProperty !== next.isDynamicProperty ||
    prev.hideActionIcons !== next.hideActionIcons ||
    prev.isConnected !== next.isConnected ||
    prev.onValueChange !== next.onValueChange
  ) {
    return false;
  }
  if (!isEqual(prev.inspectorBatchNodeIds, next.inspectorBatchNodeIds)) {
    return false;
  }
  if (!isFieldRelevantDataEqual(prev.data, next.data, prev.isDynamicProperty)) {
    return false;
  }
  if (!isEqual(prev.value, next.value)) {
    return false;
  }
  return isEqual(prev.property, next.property);
});

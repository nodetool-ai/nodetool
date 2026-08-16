import React, { memo } from "react";
//mui

import {
  Text,
  Divider,
  ContextMenu,
  SPACING,
  getSpacingPx,
  MenuItem
} from "../ui_primitives";
import { shallow } from "zustand/shallow";
import useContextMenuStore from "../../stores/ContextMenuStore";
import ContextMenuItem from "./ContextMenuItem";
import DeleteIcon from "@mui/icons-material/Delete";
import SettingsBackupRestoreIcon from "@mui/icons-material/SettingsBackupRestore";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CategoryIcon from "@mui/icons-material/Category";
import { useNodes } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import { Property, TypeMetadata } from "../../stores/ApiTypes";
import {
  defaultValueForType,
  normalizeDynamicSlots,
  valueFitsType
} from "../../utils/dynamicSlots";
import {
  allowedSlotTypes,
  isSchemaDrivenDynamicNode,
  slotTypeKey,
  slotTypeLabel
} from "../../utils/dynamicSlotTypes";
import { getShortcutTooltip } from "../../config/shortcuts";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { serializeValue } from "../../utils/serializeValue";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useExposedInputToggle } from "../../hooks/nodes/useExposedInputToggle";
import { isObjectLike } from "../../utils/typePredicates";

/** Payload from inspector multi-edit: reset/copy/remove apply to every id. */
function resolvePropertyMenuTargetNodeIds(
  nodeId: string | null,
  payload: unknown
): string[] {
  if (isObjectLike(payload)) {
    const raw = (payload as { inspectorBatchNodeIds?: unknown })
      .inspectorBatchNodeIds;
    if (
      Array.isArray(raw) &&
      raw.length > 0 &&
      raw.every((x): x is string => typeof x === "string")
    ) {
      return [...raw];
    }
  }
  return nodeId ? [nodeId] : [];
}

const PropertyContextMenuComponent: React.FC = () => {
  const { writeClipboard } = useClipboard();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const {
    menuPosition,
    closeContextMenu,
    nodeId,
    handleId,
    description,
    isDynamicProperty,
    payload
  } = useContextMenuStore((state) => ({
    menuPosition: state.menuPosition,
    closeContextMenu: state.closeContextMenu,
    description: state.description,
    nodeId: state.nodeId,
    handleId: state.handleId,
    isDynamicProperty: state.isDynamicProperty,
    payload: state.payload
  }), shallow);
  const { findNode, updateNodeData, updateNodeProperties, edges } = useNodes(
    (state) => ({
      findNode: state.findNode,
      updateNodeData: state.updateNodeData,
      updateNodeProperties: state.updateNodeProperties,
      edges: state.edges
    }),
    shallow
  );
  const metadata = useMetadataStore((state) => state.metadata);
  const {
    canToggleExposed,
    getPlacement,
    toggleExposedInput,
    toggleExposedInputLabeled
  } = useExposedInputToggle();

  if (!menuPosition) {
    return null;
  }

  const targetIds = resolvePropertyMenuTargetNodeIds(nodeId, payload);
  const propertyName = handleId ?? "";
  const showExposedToggle =
    !isDynamicProperty &&
    propertyName.length > 0 &&
    targetIds.length > 0 &&
    canToggleExposed(targetIds[0], propertyName);
  const exposedPlacement =
    showExposedToggle && targetIds[0]
      ? getPlacement(targetIds[0], propertyName)
      : null;
  const isExposedHandle = exposedPlacement === "handle";
  const isExposedLabeled = exposedPlacement === "labeled";
  const isConnected =
    showExposedToggle &&
    targetIds.some((nid) =>
      edges.some(
        (edge) => edge.target === nid && edge.targetHandle === propertyName
      )
    );

  const handleToggleExposedInput = (event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    toggleExposedInput(targetIds, propertyName);
    closeContextMenu();
  };

  const handleToggleExposedInputLabeled = (
    event?: React.MouseEvent<HTMLElement>
  ) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    toggleExposedInputLabeled(targetIds, propertyName);
    closeContextMenu();
  };

  // Slot-type entries. Only for user-owned dynamic slots — schema-driven
  // nodes rewrite `dynamic_inputs` wholesale, so a pick there wouldn't stick.
  const slotTypeNode = isDynamicProperty && nodeId ? findNode(nodeId) : undefined;
  const slotTypeOptions =
    slotTypeNode && handleId && !isSchemaDrivenDynamicNode(slotTypeNode)
      ? allowedSlotTypes(
          slotTypeNode.type ? metadata?.[slotTypeNode.type] : undefined
        )
      : null;

  const handleSetSlotType = (type: TypeMetadata) => {
    if (!handleId) {
      closeContextMenu();
      return;
    }
    for (const nid of resolvePropertyMenuTargetNodeIds(nodeId, payload)) {
      const node = findNode(nid);
      if (!node) {
        continue;
      }
      // Keep a value the new type can still hold — same rule the slot-type
      // chip applies, so the two entry points agree on one retype.
      const previous = node.data.dynamic_properties?.[handleId];
      const keepValue = previous !== undefined && valueFitsType(previous, type);
      updateNodeData(nid, {
        dynamic_properties: {
          ...node.data.dynamic_properties,
          [handleId]: keepValue ? previous : defaultValueForType(type)
        },
        dynamic_inputs: {
          ...normalizeDynamicSlots(node.data.dynamic_inputs),
          [handleId]: { type }
        }
      });
    }
    closeContextMenu();
  };

  const handleRemoveDynamicProperty = (
    event?: React.MouseEvent<HTMLElement>
  ) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const targetIds = resolvePropertyMenuTargetNodeIds(nodeId, payload);
    if (handleId) {
      for (const nid of targetIds) {
        const node = findNode(nid);
        if (node?.data.dynamic_properties) {
          const { [handleId]: _, ...remainingProperties } =
            node.data.dynamic_properties;
          const remainingSlots = normalizeDynamicSlots(node.data.dynamic_inputs);
          delete remainingSlots[handleId];
          updateNodeData(nid, {
            dynamic_properties: remainingProperties,
            dynamic_inputs: remainingSlots
          });
        }
      }
    }
    closeContextMenu();
  };

  const handleCopyValue = async (event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const targetIds = resolvePropertyMenuTargetNodeIds(nodeId, payload);
    const copyFromId = targetIds[0];
    if (copyFromId && handleId) {
      const node = findNode(copyFromId);
      if (!node) {
        closeContextMenu();
        return;
      }

      const value = isDynamicProperty
        ? node.data.dynamic_properties?.[handleId]
        : node.data.properties?.[handleId];

      const serialized = serializeValue(value);
      if (serialized !== null && serialized.trim().length > 0) {
        try {
          await writeClipboard(serialized, true);
          addNotification({
            type: "success",
            content: "Value copied to clipboard"
          });
        } catch {
          addNotification({
            type: "error",
            content: "Failed to copy to clipboard"
          });
        }
      } else {
        addNotification({
          type: "warning",
          content: "No value to copy"
        });
      }
    }
    closeContextMenu();
  };

  const handleReset = (event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const targetIds = resolvePropertyMenuTargetNodeIds(nodeId, payload);
    if (handleId) {
      for (const nid of targetIds) {
        const node = findNode(nid);
        if (!node) {
          continue;
        }

        if (isDynamicProperty) {
          const dynamicInputDefaults = node.data?.dynamic_inputs || {};
          let defaultValue = dynamicInputDefaults?.[handleId]?.default;

          if (defaultValue === undefined) {
            const nodeMetadata = node.type ? metadata?.[node.type] : undefined;
            if (nodeMetadata) {
              const propertyDef = nodeMetadata.properties.find(
                (prop: Property) => prop.name === handleId
              );
              defaultValue = propertyDef?.default;
            }
          }

          if (defaultValue !== undefined && node.data.dynamic_properties) {
            updateNodeData(nid, {
              dynamic_properties: {
                ...node.data.dynamic_properties,
                [handleId]: defaultValue
              }
            });
          }
        } else {
          const nodeMetadata = node.type ? metadata?.[node.type] : undefined;
          if (nodeMetadata) {
            const propertyDef = nodeMetadata.properties.find(
              (prop: Property) => prop.name === handleId
            );
            if (propertyDef) {
              updateNodeProperties(nid, { [handleId]: propertyDef.default });
            }
          }
        }
      }
    }
    closeContextMenu();
  };

  return (
    <ContextMenu
      className="context-menu property-context-menu"
      open={menuPosition !== null}
      onClose={closeContextMenu}
      onContextMenu={(event) => event.preventDefault()}
      position={menuPosition}
    >
      <MenuItem disabled>
        <Text>Property</Text>
      </MenuItem>

      {description && description.length > 0 && (
        <MenuItem
          disabled
          sx={{
            color: "text.primary",
            opacity: "1 !important",
            whiteSpace: "normal",
            maxWidth: "300px"
          }}
        >
          <Text
            size="small"
            sx={{
              padding: `${getSpacingPx(SPACING.xs)} 0`
            }}
          >
            {description}
          </Text>
        </MenuItem>
      )}

      <Divider />
      <ContextMenuItem
        onClick={handleCopyValue}
        label="Copy Value"
        addButtonClassName="copy-value"
        IconComponent={<ContentCopyIcon />}
        tooltip="Copy property value to clipboard"
      />
      <ContextMenuItem
        onClick={handleReset}
        label="Reset To Default Value"
        addButtonClassName="reset"
        IconComponent={<SettingsBackupRestoreIcon />}
        tooltip={getShortcutTooltip("resetDefault")}
      />

      {showExposedToggle && (
        <>
          <ContextMenuItem
            onClick={handleToggleExposedInput}
            label={
              isExposedHandle
                ? "Hide Input Handle (Top)"
                : "Show As Input Handle (Top)"
            }
            addButtonClassName="toggle-exposed-input"
            IconComponent={<ArrowForwardIcon />}
            tooltip={
              isExposedHandle
                ? isConnected
                  ? "Hide top input handle (disconnects edge)"
                  : "Hide top input handle"
                : "Show as handle on the left/top of the node (no label)"
            }
          />
          <ContextMenuItem
            onClick={handleToggleExposedInputLabeled}
            label={
              isExposedLabeled
                ? "Hide Labeled Input (Bottom)"
                : "Show Labeled Input (Bottom)"
            }
            addButtonClassName="toggle-exposed-input-labeled"
            IconComponent={<ArrowForwardIcon />}
            tooltip={
              isExposedLabeled
                ? isConnected
                  ? "Hide labeled input at bottom (disconnects edge)"
                  : "Hide labeled input at bottom"
                : "Show input at bottom with parameter title and editor"
            }
          />
        </>
      )}

      {isDynamicProperty && <Divider />}
      {slotTypeOptions !== null && (
        <MenuItem disabled>
          <Text size="small">Slot Type</Text>
        </MenuItem>
      )}
      {slotTypeOptions?.map((option) => (
        <ContextMenuItem
          key={slotTypeKey(option)}
          onClick={() => handleSetSlotType(option)}
          label={slotTypeLabel(option)}
          addButtonClassName={`set-slot-type set-slot-type-${slotTypeKey(
            option
          )}`}
          IconComponent={<CategoryIcon />}
          tooltip={`Declare "${propertyName}" as ${slotTypeLabel(option)}`}
        />
      ))}
      {isDynamicProperty && (
        <ContextMenuItem
          onClick={handleRemoveDynamicProperty}
          label="Remove Dynamic Property"
          addButtonClassName="remove-dynamic-property"
          IconComponent={<DeleteIcon />}
          tooltip="Remove this property from being dynamic"
        />
      )}
    </ContextMenu>
  );
};

export default memo(PropertyContextMenuComponent);

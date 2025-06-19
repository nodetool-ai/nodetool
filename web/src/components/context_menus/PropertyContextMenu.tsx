import React from "react";
//mui
import { Divider, Menu, MenuItem, Typography } from "@mui/material";
import useContextMenuStore from "../../stores/ContextMenuStore";
import ThemeNodes from "../themes/ThemeNodes";
import ContextMenuItem from "./ContextMenuItem";
import DeleteIcon from "@mui/icons-material/Delete";
import SettingsBackupRestoreIcon from "@mui/icons-material/SettingsBackupRestore";
import { useNodes } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import { Property } from "../../stores/ApiTypes";

const PropertyContextMenu: React.FC = () => {
  const {
    menuPosition,
    closeContextMenu,
    nodeId,
    handleId,
    description,
    isDynamicProperty
  } = useContextMenuStore((state) => {
    return {
      menuPosition: state.menuPosition,
      closeContextMenu: state.closeContextMenu,
      description: state.description,
      nodeId: state.nodeId,
      handleId: state.handleId,
      isDynamicProperty: state.isDynamicProperty
    };
  });
  const { findNode, updateNodeData, updateNodeProperties } = useNodes(
    (state) => ({
      findNode: state.findNode,
      updateNodeData: state.updateNodeData,
      updateNodeProperties: state.updateNodeProperties
    })
  );
  const metadata = useMetadataStore((state) => state.metadata);

  if (!menuPosition) return null;

  const handleRemoveDynamicProperty = (
    event?: React.MouseEvent<HTMLElement>
  ) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (nodeId && handleId) {
      const node = findNode(nodeId);
      if (node?.data.dynamic_properties) {
        const { [handleId]: _, ...remainingProperties } =
          node.data.dynamic_properties;
        updateNodeData(nodeId, { dynamic_properties: remainingProperties });
      }
    }
    closeContextMenu();
  };

  const handleReset = (event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (nodeId && handleId) {
      const node = findNode(nodeId);
      if (!node) return;

      if (isDynamicProperty) {
        // For dynamic properties, we need to find the property definition from metadata
        const nodeMetadata = metadata?.[node.type as string];
        if (nodeMetadata) {
          const propertyDef = nodeMetadata.properties.find(
            (prop: Property) => prop.name === handleId
          );
          if (propertyDef && node.data.dynamic_properties) {
            const updatedDynamicProperties = {
              ...node.data.dynamic_properties,
              [handleId]: propertyDef.default
            };
            updateNodeData(nodeId, {
              dynamic_properties: updatedDynamicProperties
            });
          }
        }
      } else {
        // For regular properties, get the default value from metadata
        const nodeMetadata = metadata?.[node.type as string];
        if (nodeMetadata) {
          const propertyDef = nodeMetadata.properties.find(
            (prop: Property) => prop.name === handleId
          );
          if (propertyDef) {
            updateNodeProperties(nodeId, { [handleId]: propertyDef.default });
          }
        }
      }
    }
    closeContextMenu();
  };

  return (
    <Menu
      className="context-menu property-context-menu"
      open={menuPosition !== null}
      onClose={closeContextMenu}
      onContextMenu={(event) => event.preventDefault()}
      anchorReference="anchorPosition"
      anchorPosition={
        menuPosition ? { top: menuPosition.y, left: menuPosition.x } : undefined
      }
    >
      <MenuItem disabled>
        <Typography variant="body1">Property</Typography>
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
          <Typography
            variant="body2"
            sx={{
              fontSize: ThemeNodes.fontSizeSmall,
              padding: "4px 0"
            }}
          >
            {description}
          </Typography>
        </MenuItem>
      )}

      <Divider />
      <ContextMenuItem
        onClick={handleReset}
        label="Reset To Default Value"
        addButtonClassName="reset"
        IconComponent={<SettingsBackupRestoreIcon />}
        tooltip="Control + Right Click"
      />

      {isDynamicProperty && (
        <>
          <Divider />
          <ContextMenuItem
            onClick={handleRemoveDynamicProperty}
            label="Remove Dynamic Property"
            addButtonClassName="remove-dynamic-property"
            IconComponent={<DeleteIcon />}
            tooltip="Remove this property from being dynamic"
          />
        </>
      )}
    </Menu>
  );
};

export default PropertyContextMenu;

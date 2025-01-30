import React from "react";
//mui
import { Divider, Menu, MenuItem, Typography } from "@mui/material";
import useContextMenuStore from "../../stores/ContextMenuStore";
import ThemeNodes from "../themes/ThemeNodes";
import ContextMenuItem from "./ContextMenuItem";
import DeleteIcon from "@mui/icons-material/Delete";
import { useNodes } from "../../contexts/NodeContext";

// TODO: WIP: reset property value to default, already implemented using the shortcut ctrl right-click in components/node/PropertyInput.tsx
// import { useReactFlow } from "@xyflow/react";
// import { NodeData } from "../../stores/NodeData";
// import { useMetadata } from "../../serverState/useMetadata";
// import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";

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
  const { findNode, updateNodeData } = useNodes((state) => ({
    findNode: state.findNode,
    updateNodeData: state.updateNodeData
  }));
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
  //reset
  // const handleReset = (event?: React.MouseEvent<HTMLElement>) => {
  //   if (event) {
  //     event.preventDefault();
  //     event.stopPropagation();
  //     // TODO: WIP: reset property value to default, already implemented using the shortcut ctrl right-click in components/node/PropertyInput.tsx
  //   }
  //   closeContextMenu();
  // };

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
      <Divider />
      {/* <ContextMenuItem
        onClick={closeContextMenu}
        label="Reset To Default Value"
        addButtonClassName="reset"
        IconComponent={<SettingsBackupRestoreIcon />}
        tooltip="Control + Right Click"
      /> */}
    </Menu>
  );
};

export default PropertyContextMenu;

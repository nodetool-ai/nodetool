import React from "react";
//mui
import { Divider, Menu, MenuItem, Typography } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
//icons
import SettingsBackupRestoreIcon from "@mui/icons-material/SettingsBackupRestore";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";

// TODO: WIP: reset property value to default, already implemented using the shortcut ctrl right-click in components/node/PropertyInput.tsx
// import { useReactFlow } from "reactflow";
// import { useNodeStore, NodeStore } from "../../stores/NodeStore";
// import { NodeData } from "../../stores/NodeData";
// import { useMetadata } from "../../serverState/useMetadata";
// import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";

const PropertyContextMenu: React.FC = () => {
  const { menuPosition, closeContextMenu } = useContextMenuStore(
    (state) => ({
      menuPosition: state.menuPosition,
      closeContextMenu: state.closeContextMenu
    })
  );

  //reset
  const handleReset = (event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      // TODO: WIP: reset property value to default, already implemented using the shortcut ctrl right-click in components/node/PropertyInput.tsx
    }
    closeContextMenu();
  };

  if (!menuPosition) return null;
  return (
    <Menu
      className="context-menu property-context-menu"
      open={menuPosition !== null}
      onContextMenu={(event) => event.preventDefault()}
      anchorReference="anchorPosition"
      anchorPosition={
        menuPosition ? { top: menuPosition.y, left: menuPosition.x } : undefined
      }
    >
      <MenuItem disabled>
        <Typography
          style={{
            margin: ".1em 0",
            padding: "0"
          }}
          variant="body1"
        >
          Property
        </Typography>
      </MenuItem>
      <Divider />
      <ContextMenuItem
        onClick={handleReset}
        label="Reset To Default Value"
        addButtonClassName="reset"
        IconComponent={<SettingsBackupRestoreIcon />}
        tooltip={"Control + Right Click"}
      />
    </Menu>
  );
};

export default PropertyContextMenu;

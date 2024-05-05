import React from "react";
//mui
import { Divider, Menu, MenuItem, Typography } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
//icons
import ViewWeekIcon from "@mui/icons-material/ViewWeek";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { getMousePosition } from "../../utils/MousePosition";
import { devLog } from "../../utils/DevLog";
import LoginIcon from "@mui/icons-material/Login";

const InputContextMenu: React.FC = () => {
  const { openMenuType, menuPosition, closeContextMenu, type } =
    useContextMenuStore();
  const { openNodeMenu } = useNodeMenuStore();

  const handleOpenNodeMenu = (event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    openNodeMenu(
      getMousePosition().x,
      getMousePosition().y,
      true,
      type || "",
      "target"
    );
    closeContextMenu();
  };

  const handleCreateConstantNode = (event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    devLog("Create Constant Node");
    closeContextMenu();
  };
  const handleCreateInputNode = (event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    devLog("Create Input Node");
    closeContextMenu();
  };

  if (openMenuType !== "input-context-menu" || !menuPosition) return null;
  return (
    <Menu
      className="context-menu input-context-menu"
      open={menuPosition !== null}
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
          Input
        </Typography>
      </MenuItem>
      <Divider />
      <ContextMenuItem
        onClick={handleCreateConstantNode}
        label="Create Constant Node"
        addButtonClassName="create-constant-node"
        IconComponent={<LoginIcon />}
        tooltip={"..."}
      />
      <ContextMenuItem
        onClick={handleCreateInputNode}
        label="Create Input Node"
        addButtonClassName="create-input-node"
        IconComponent={<LoginIcon />}
        tooltip={"..."}
      />
      <ContextMenuItem
        onClick={handleOpenNodeMenu}
        label="Open filtered NodeMenu"
        addButtonClassName="open-node-menu"
        IconComponent={<ViewWeekIcon />}
        tooltip={"..."}
      />
    </Menu>
  );
};

export default InputContextMenu;

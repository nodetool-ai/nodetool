import React, { useCallback } from "react";
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
import LogoutIcon from "@mui/icons-material/Logout";
import { useNodeStore } from "../../stores/NodeStore";
import { useReactFlow } from "reactflow";
import useMetadataStore from "../../stores/MetadataStore";

const OutputContextMenu: React.FC = () => {
  const { openMenuType, menuPosition, closeContextMenu, type } =
    useContextMenuStore();
  const { openNodeMenu } = useNodeMenuStore();
  const createNode = useNodeStore((state) => state.createNode);
  const addNode = useNodeStore((state) => state.addNode);
  const reactFlowInstance = useReactFlow();
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  const createPreviewNode = useCallback(
    (event: React.MouseEvent) => {
      const metadata = getMetadata("nodetool.workflows.base_node.Preview");
      if (!metadata) return;
      const newNode = createNode(
        metadata,
        reactFlowInstance.project({
          x: event.clientX,
          y: event.clientY
        })
      );
      newNode.data.size = {
        width: 200,
        height: 200
      };
      newNode.data.properties.value = {
        type: "nodetool.workflows.base_node.Preview"
      };
      addNode(newNode);
    },
    [getMetadata, createNode, reactFlowInstance, addNode]
  );

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
      "source"
    );
    closeContextMenu();
  };

  const handleCreatePreviewNode = (event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      createPreviewNode(event);
    }
    devLog("Create Preview Node");
    closeContextMenu();
  };

  if (openMenuType !== "output-context-menu" || !menuPosition) return null;
  return (
    <Menu
      className="context-menu output-context-menu"
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
          Output
        </Typography>
      </MenuItem>
      <Divider />
      <ContextMenuItem
        onClick={handleCreatePreviewNode}
        label="Create Preview Node"
        addButtonClassName="create-preview-node"
        IconComponent={<LogoutIcon />}
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

export default OutputContextMenu;

import React, { useCallback, useState } from "react";
import { useReactFlow } from "@xyflow/react";
//mui
import {
  Checkbox,
  Divider,
  FormControlLabel,
  Menu,
  MenuItem,
  Typography
} from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
//icons
import QueueIcon from "@mui/icons-material/Queue";
import CopyAllIcon from "@mui/icons-material/CopyAll";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import DataArrayIcon from "@mui/icons-material/DataArray";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import GroupRemoveIcon from "@mui/icons-material/GroupRemove";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useNodeStore, NodeStore } from "../../stores/NodeStore";
import { NodeData } from "../../stores/NodeData";
import { useNotificationStore } from "../../stores/NotificationStore";
//behaviours
import { useDuplicateNodes } from "../../hooks/useDuplicate";
import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";
//utils
import { useClipboard } from "../../hooks/browser/useClipboard";
import { devLog } from "../../utils/DevLog";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useRemoveFromGroup } from "../../hooks/nodes/useRemoveFromGroup";
//reactflow
import { Node } from "@xyflow/react";
import useMetadataStore from "../../stores/MetadataStore";

const NodeContextMenu: React.FC = () => {
  const menuPosition = useContextMenuStore((state) => state.menuPosition);
  const closeContextMenu = useContextMenuStore(
    (state) => state.closeContextMenu
  );
  const nodeId = useContextMenuStore((state) => state.nodeId);
  const openDocumentation = useNodeMenuStore(
    (state) => state.openDocumentation
  );
  const { getNode } = useReactFlow();
  const deleteNode = useNodeStore((state: NodeStore) => state.deleteNode);
  const updateNodeData = useNodeStore(
    (state: NodeStore) => state.updateNodeData
  );
  const node = nodeId !== null ? getNode(nodeId) : null;
  const nodeData = node?.data as NodeData;
  const removeFromGroup = useRemoveFromGroup();
  const metadata = useMetadataStore((state) =>
    state.getMetadata(node?.type ?? "")
  );
  const { handleCopy } = useCopyPaste();
  // const isCollapsed = nodeData?.collapsed || false;
  const duplicateNodes = useDuplicateNodes();
  const { writeClipboard } = useClipboard();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  //copy metadata to clipboard
  const handleCopyMetadataToClipboard = useCallback(() => {
    if (nodeId && nodeData) {
      const metadataToCopy = {
        NodeData: metadata
      };
      devLog("Copying metadata to clipboard", metadataToCopy);
      addNotification({
        type: "info",
        alert: true,
        content: "Copied NodeData to Clipboard!"
      });
      writeClipboard(JSON.stringify(metadataToCopy), true, true);
      closeContextMenu();
    }
  }, [
    nodeId,
    nodeData,
    metadata,
    addNotification,
    writeClipboard,
    closeContextMenu
  ]);

  //copy
  const handleCopyClicked = useCallback(
    (event: React.MouseEvent<HTMLElement>, nodeId: string | null) => {
      event.stopPropagation();
      handleCopy(nodeId || "");
    },
    [handleCopy]
  );

  //delete
  const handleDelete = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      event?.preventDefault();
      event?.stopPropagation();
      const { nodeId } = useContextMenuStore.getState();
      if (nodeId !== null) {
        deleteNode(nodeId);
        closeContextMenu();
      }
    },
    [closeContextMenu, deleteNode]
  );

  //collapse
  // const toggleCollapse = useCallback(
  //   (val: boolean) => {
  //     if (nodeId !== null) {
  //       updateNodeData(nodeId, {
  //         properties: { ...nodeData?.properties },
  //         workflow_id: nodeData?.workflow_id || "",
  //         collapsed: val
  //       });
  //     }
  //   },
  //   [nodeData?.properties, nodeData?.workflow_id, nodeId, updateNodeData]
  // );

  const handleDuplicateNodes = useCallback(() => {
    duplicateNodes();
    closeContextMenu();
  }, [closeContextMenu, duplicateNodes]);

  // const handleCollapse = (
  //   event: React.ChangeEvent<HTMLInputElement>,
  //   checked: boolean
  // ) => {
  //   toggleCollapse(checked);
  // };

  const handleOpenDocumentation = useCallback(() => {
    openDocumentation(node?.type || "", {
      x: (menuPosition?.x ?? 0) + 100,
      y: menuPosition?.y ?? 0
    });
  }, [menuPosition?.x, menuPosition?.y, node?.type, openDocumentation]);

  return (
    <Menu
      className="context-menu node-context-menu"
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
            margin: "0",
            padding: "0"
          }}
          variant="body1"
        >
          NODE
        </Typography>
      </MenuItem>

      {node?.parentId && (
        <ContextMenuItem
          onClick={() => removeFromGroup([node as Node<NodeData>])}
          label="Remove from Group"
          IconComponent={<GroupRemoveIcon />}
          tooltip="Remove this node from the group"
        />
      )}

      <ContextMenuItem
        onClick={handleDuplicateNodes}
        label="Duplicate"
        IconComponent={<QueueIcon />}
        tooltip="Space+D"
      />
      <ContextMenuItem
        onClick={(event: any) => handleCopyClicked(event, nodeId)}
        label="Copy"
        IconComponent={<CopyAllIcon />}
        tooltip="CTRL+C | Meta+C"
      />
      {/* <ContextMenuItem
        onClick={(event: any) => handleCopyClicked(event, nodeId)}
        label="Collapsed"
        IconComponent={<CopyAllIcon />}
        tooltip="Double click node header"
        controlElement={
          <FormControlLabel
            className="nodrag checkbox"
            label="Collapsed"
            control={
              <Checkbox checked={isCollapsed} onChange={handleCollapse} />
            }
          />
        }
      /> */}
      <Divider />
      <ContextMenuItem
        onClick={handleCopyMetadataToClipboard}
        label="Copy NodeData"
        IconComponent={<DataArrayIcon />}
        tooltip="Copy node metadata to the clipboard"
      />
      <ContextMenuItem
        onClick={handleOpenDocumentation}
        label="Documentation"
        IconComponent={<OpenInNewIcon />}
        tooltip="Open documentation for this node"
      />

      <Divider />
      <ContextMenuItem
        onClick={handleDelete}
        label="Delete"
        IconComponent={<RemoveCircleIcon />}
        tooltip="Backspace | Del"
        addButtonClassName="delete"
      />
    </Menu>
  );
};

export default NodeContextMenu;

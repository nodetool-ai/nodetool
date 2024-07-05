import React, { useCallback } from "react";
import { useReactFlow } from "reactflow";
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
import { useMetadata } from "../../serverState/useMetadata";
import { isUrlAccessible } from "../../utils/isUrlAccessible";

const NodeContextMenu: React.FC = () => {
  const { openMenuType, menuPosition, closeContextMenu, nodeId } =
    useContextMenuStore();

  const { getNode } = useReactFlow();
  const deleteNode = useNodeStore((state: NodeStore) => state.deleteNode);
  const updateNode = useNodeStore((state: NodeStore) => state.updateNodeData);
  const node = nodeId !== null ? getNode(nodeId) : null;
  const nodeData = node?.data as NodeData;

  const { data } = useMetadata();
  const metadata = node?.type ? data?.metadataByType[node?.type] : null;
  const { handleCopy } = useCopyPaste();
  const isCollapsed = nodeData?.collapsed || false;
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
  const handleCopyClicked = (
    event: React.MouseEvent<HTMLElement>,
    nodeId: string | null
  ) => {
    event.stopPropagation();
    handleCopy(nodeId || "");
    // closeContextMenu();
  };

  //delete
  const handleDelete = (event?: React.MouseEvent<HTMLElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    const { nodeId } = useContextMenuStore.getState();
    if (nodeId !== null) {
      deleteNode(nodeId);
      closeContextMenu();
    }
  };

  //collapse
  const toggleCollapse = (val: boolean) => {
    if (nodeId !== null) {
      updateNode(nodeId, {
        properties: { ...nodeData?.properties },
        workflow_id: nodeData?.workflow_id || "",
        collapsed: val
      });
    }
  };
  const handleDuplicateNodes = useCallback(() => {
    const nodeIdsToDuplicate =
      nodeId !== null && getNode(nodeId) ? [nodeId] : [];
    duplicateNodes(nodeIdsToDuplicate);
    closeContextMenu();
  }, [nodeId, closeContextMenu, getNode, duplicateNodes]);

  const handleCollapse = (
    event: React.ChangeEvent<HTMLInputElement>,
    checked: boolean
  ) => {
    toggleCollapse(checked);
  };

  const handleOpenDocumentation = async () => {
    if (node) {
      const { type } = node;
      const { namespace, title } = metadata || {};
      if (namespace && title) {
        const formattedNamespace = namespace.replace(/\./g, "/");
        const formattedTitle = title.replace(/\s+/g, "").toLowerCase();
        const documentationUrl = `https://nodetool-ai.github.io/nodetool/nodes/${formattedNamespace}.html#${formattedTitle}`;

        const urlAccessible = await isUrlAccessible(documentationUrl);
        if (urlAccessible) {
          window.open(documentationUrl, "_blank");
        } else {
          addNotification({
            type: "error",
            alert: true,
            timeout: 10000,
            dismissable: true,
            content: `Documentation page not found: ${documentationUrl}`
          });
        }
      } else {
        addNotification({
          type: "error",
          alert: true,
          content: `No documentation found for node type: ${type}`
        });
      }
    }
  };

  if (openMenuType !== "node-context-menu" || !menuPosition) {
    return null;
  }
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
      <ContextMenuItem
        onClick={handleDuplicateNodes}
        label="Duplicate"
        IconComponent={<QueueIcon />}
        tooltip="Alt+D | Meta+D"
      />
      <ContextMenuItem
        onClick={(event: any) => handleCopyClicked(event, nodeId)}
        label="Copy"
        IconComponent={<CopyAllIcon />}
        tooltip="Shift+C"
      />
      <ContextMenuItem
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
      />
      <Divider />
      <ContextMenuItem
        onClick={handleOpenDocumentation}
        label="Documentation"
        IconComponent={<OpenInNewIcon />}
        tooltip="Open documentation for this node"
      />

      <ContextMenuItem
        onClick={handleCopyMetadataToClipboard}
        label="Copy NodeData"
        IconComponent={<DataArrayIcon />}
        tooltip="Copy node metadata to the clipboard"
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

import React, { useCallback, useState, useEffect } from "react";
//mui
import { Divider, Menu, MenuItem, Typography } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
//icons
import ViewWeekIcon from "@mui/icons-material/ViewWeek";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { getMousePosition } from "../../utils/MousePosition";
import { devLog } from "../../utils/DevLog";
import LogoutIcon from "@mui/icons-material/Logout";
import { useReactFlow } from "@xyflow/react";
import useMetadataStore from "../../stores/MetadataStore";
import { labelForType } from "../../config/data_types";
import { Slugify } from "../../utils/TypeHandler";
import { getTimestampForFilename } from "../../utils/formatDateAndTime";
import useConnectableNodesStore from "../../stores/ConnectableNodesStore";
import { useNodes } from "../../contexts/NodeContext";

const OutputContextMenu: React.FC = () => {
  const {
    nodeId,
    menuPosition,
    closeContextMenu,
    type: sourceType,
    handleId: sourceHandle
  } = useContextMenuStore((state) => ({
    nodeId: state.nodeId,
    menuPosition: state.menuPosition,
    closeContextMenu: state.closeContextMenu,
    type: state.type,
    handleId: state.handleId
  }));
  const { openNodeMenu } = useNodeMenuStore();
  const { createNode, addNode, addEdge, generateEdgeId } = useNodes(
    (state) => ({
      createNode: state.createNode,
      addNode: state.addNode,
      addEdge: state.addEdge,
      generateEdgeId: state.generateEdgeId
    })
  );
  const reactFlowInstance = useReactFlow();
  const { getMetadata } = useMetadataStore((state) => ({
    getMetadata: state.getMetadata
  }));
  const [outputNodeMetadata, setOutputNodeMetadata] = useState<any>();
  const [saveNodeMetadata, setSaveNodeMetadata] = useState<any>();
  const {
    showMenu,
    setSourceHandle,
    setTargetHandle,
    setNodeId,
    setFilterType,
    setConnectableType
  } = useConnectableNodesStore((state) => ({
    showMenu: state.showMenu,
    setSourceHandle: state.setSourceHandle,
    setTargetHandle: state.setTargetHandle,
    setNodeId: state.setNodeId,
    setFilterType: state.setFilterType,
    setConnectableType: state.setTypeMetadata
  }));

  type HandleType = "value" | "image" | "df" | "values";
  const getTargetHandle = useCallback(
    (type: string, nodeType: string): HandleType => {
      const typeMap: { [key: string]: HandleType } = {
        image: "image",
        dataframe: "df",
        list: "values"
      };
      if (nodeType === "preview") {
        return "value";
      } else if (nodeType === "output") {
        return "value";
      } else {
        return typeMap[type] || "value";
      }
    },
    []
  );

  const fetchMetadata = useCallback(
    (nodeType: string) => {
      devLog(`Fetching metadata for node type: ${nodeType}`);
      const datatypeLabel = labelForType(nodeType || "").replaceAll(" ", "");
      const adjustedLabel = datatypeLabel === "String" ? "Text" : datatypeLabel;
      const outputNodePath = `nodetool.output.${datatypeLabel}Output`;
      const outputMetadata = getMetadata(outputNodePath);
      setOutputNodeMetadata(outputMetadata);

      const saveNodePath = `nodetool.${adjustedLabel.toLowerCase()}.Save${adjustedLabel}`;
      const saveMetadata = getMetadata(saveNodePath);
      setSaveNodeMetadata(saveMetadata);
    },
    [getMetadata]
  );

  useEffect(() => {
    if (sourceType && sourceType.type !== "") {
      fetchMetadata(sourceType.type);
    }
  }, [sourceType, fetchMetadata]);

  const createNodeWithEdge = useCallback(
    (metadata: any, position: { x: number; y: number }, nodeType: string) => {
      if (!metadata) {
        devLog("Metadata is undefined, cannot create node.");
        return;
      }

      const newNode = createNode(
        metadata,
        reactFlowInstance.screenToFlowPosition({
          x: position.x + 150,
          y: position.y
        })
      );

      if (metadata.style) {
        newNode.style = metadata.style;
      }

      newNode.data.size = {
        width:
          typeof newNode.style?.width === "number"
            ? newNode.style.width
            : parseInt(newNode.style?.width as string, 10) || 200,
        height:
          typeof newNode.style?.height === "number"
            ? newNode.style.height
            : parseInt(newNode.style?.height as string, 10) || 200
      };

      newNode.data.properties.name =
        `${sourceType?.type}_${sourceHandle}_${getTimestampForFilename(
          false
        )}` || "";

      addNode(newNode);
      const targetHandle = getTargetHandle(sourceType?.type || "", nodeType);
      addEdge({
        id: generateEdgeId(),
        source: nodeId || "",
        target: newNode.id,
        sourceHandle: sourceHandle,
        targetHandle: targetHandle,
        type: "default",
        className: Slugify(sourceType?.type || "")
      });
    },
    [
      createNode,
      reactFlowInstance,
      addNode,
      getTargetHandle,
      addEdge,
      generateEdgeId,
      nodeId,
      sourceHandle,
      sourceType
    ]
  );

  const createPreviewNode = useCallback(
    (event: React.MouseEvent) => {
      const metadata = getMetadata("nodetool.workflows.base_node.Preview");
      if (!metadata) {
        return;
      }
      const position = {
        x: event.clientX - 200,
        y: event.clientY - 100
      };
      createNodeWithEdge(
        {
          ...metadata,
          style: {
            width: "160px",
            height: "160px"
          }
        },
        position,
        "preview"
      );
    },
    [getMetadata, createNodeWithEdge]
  );

  const createOutputNode = useCallback(
    (event: React.MouseEvent) => {
      if (!outputNodeMetadata) {
        return;
      }
      createNodeWithEdge(
        outputNodeMetadata,
        {
          x: event.clientX - 230,
          y: event.clientY - 170
        },
        "output"
      );
    },
    [outputNodeMetadata, createNodeWithEdge]
  );

  const createSaveNode = useCallback(
    (event: React.MouseEvent) => {
      if (!saveNodeMetadata) {
        return;
      }
      createNodeWithEdge(
        saveNodeMetadata,
        {
          x: event.clientX - 230,
          y: event.clientY - 220
        },
        "save"
      );
    },
    [saveNodeMetadata, createNodeWithEdge]
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
      sourceType?.type || "",
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
    closeContextMenu();
  };

  const handleCreateOutputNode = (event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      createOutputNode(event);
    }
    closeContextMenu();
  };

  const handleCreateSaveNode = (event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      createSaveNode(event);
    }
    closeContextMenu();
  };

  const handleShowConnectableNodes = (
    event?: React.MouseEvent<HTMLElement>
  ) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (menuPosition) {
      setSourceHandle(sourceHandle);
      setNodeId(nodeId);
      setFilterType("input");
      setConnectableType(sourceType);
      showMenu({ x: menuPosition.x, y: menuPosition.y });
    }
    closeContextMenu();
  };

  if (!menuPosition) return null;
  return (
    <>
      <Menu
        className="context-menu output-context-menu"
        open={menuPosition !== null}
        onContextMenu={(event) => event.preventDefault()}
        anchorReference="anchorPosition"
        anchorPosition={
          menuPosition
            ? { top: menuPosition.y, left: menuPosition.x }
            : undefined
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
        />
        {outputNodeMetadata && (
          <ContextMenuItem
            onClick={handleCreateOutputNode}
            label="Create Output Node"
            addButtonClassName="create-output-node"
            IconComponent={<LogoutIcon />}
          />
        )}
        {saveNodeMetadata && (
          <ContextMenuItem
            onClick={handleCreateSaveNode}
            label={`Create Save${
              sourceType?.type === "string"
                ? "Text"
                : sourceType?.type_name
                ? sourceType.type_name?.charAt(0).toUpperCase() +
                  sourceType.type_name?.slice(1)
                : ""
            } Node`}
            addButtonClassName="create-save-node"
            IconComponent={<SaveAltIcon />}
          />
        )}
        <Divider />
        <ContextMenuItem
          onClick={handleShowConnectableNodes}
          label="Show Connectable Nodes"
          addButtonClassName="show-connectable-nodes"
          IconComponent={<ViewWeekIcon />}
        />
        <ContextMenuItem
          onClick={handleOpenNodeMenu}
          label="Open filtered NodeMenu"
          addButtonClassName="open-node-menu"
          IconComponent={<ViewWeekIcon />}
        />
      </Menu>
    </>
  );
};

export default OutputContextMenu;

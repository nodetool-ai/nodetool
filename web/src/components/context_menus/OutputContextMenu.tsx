import React, { useCallback, useState, useEffect, memo } from "react";
import { shallow } from "zustand/shallow";
//mui
import { Divider, Menu } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ContextMenuItem from "./ContextMenuItem";
//icons
import VisibilityIcon from "@mui/icons-material/Visibility";
import DataObjectIcon from "@mui/icons-material/DataObject";
import AltRouteIcon from "@mui/icons-material/AltRoute";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import HubIcon from "@mui/icons-material/Hub";
import ListAltIcon from "@mui/icons-material/ListAlt";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { getMousePosition } from "../../utils/MousePosition";
import log from "loglevel";
import { useReactFlow } from "@xyflow/react";
import useMetadataStore from "../../stores/MetadataStore";
import { labelForType } from "../../config/data_types";
import { Slugify } from "../../utils/TypeHandler";
import { constantForType } from "../../utils/NodeTypeMapping";
import useConnectableNodesStore from "../../stores/ConnectableNodesStore";
import { useNodes } from "../../contexts/NodeContext";

const OutputContextMenu: React.FC = () => {
  const theme = useTheme();
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
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);
  // Combine multiple useNodes subscriptions into a single selector with shallow equality
  // to reduce unnecessary re-renders when other parts of the node state change
  const { createNode, addNode, addEdge, generateEdgeId } = useNodes(
    (state) => ({
      createNode: state.createNode,
      addNode: state.addNode,
      addEdge: state.addEdge,
      generateEdgeId: state.generateEdgeId
    }),
    shallow
  );
  const reactFlowInstance = useReactFlow();
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const [outputNodeMetadata, setOutputNodeMetadata] = useState<any>();
  const [saveNodeMetadata, setSaveNodeMetadata] = useState<any>();
  const {
    showMenu,
    typeMetadata: _typeMetadata,
    setSourceHandle,
    setTargetHandle: _setTargetHandle,
    setNodeId,
    setFilterType,
    setConnectableType
  } = useConnectableNodesStore((state) => ({
    showMenu: state.showMenu,
    typeMetadata: state.typeMetadata,
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
      log.info(`Fetching metadata for node type: ${nodeType}`);
      const datatypeLabel = labelForType(nodeType || "").replaceAll(" ", "");
      const adjustedLabel = datatypeLabel === "String" ? "Text" : datatypeLabel;
      
      // Use the generic Output node that handles all types
      const outputNodePath = "nodetool.output.Output";
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
    (
      metadata: any,
      position: { x: number; y: number },
      nodeType: string,
      targetHandle: string | null = null
    ) => {
      if (!metadata) {
        log.info("Metadata is undefined, cannot create node.");
        return;
      }

      const newNode = createNode(
        metadata,
        reactFlowInstance.screenToFlowPosition({
          x: position.x + 150,
          y: position.y
        })
      );

      if (targetHandle) {
        newNode.data.dynamic_properties[targetHandle] = true;
      }

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

      if (!targetHandle) {
        targetHandle = getTargetHandle(sourceType?.type || "", nodeType);
      }

      if (sourceHandle && newNode.data.properties.name !== undefined) {
        newNode.data.properties.name = sourceHandle;
      }

      addNode(newNode);
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
            width: "400px",
            height: "300px"
          }
        },
        position,
        "preview"
      );
    },
    [getMetadata, createNodeWithEdge]
  );

  const createRerouteNode = useCallback(
    (event: React.MouseEvent) => {
      const metadata = getMetadata("nodetool.control.Reroute");
      if (!metadata) {
        return;
      }
      const position = {
        x: event.clientX - 140,
        y: event.clientY - 60
      };
      createNodeWithEdge(metadata, position, "reroute", "input_value");
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

  const constantNodeType = sourceType?.type ? constantForType(sourceType.type) : null;

  const createConstantNode = useCallback(
    (event: React.MouseEvent) => {
      if (!constantNodeType) {
        return;
      }
      const metadata = getMetadata(constantNodeType);
      if (!metadata) {
        return;
      }
      const targetHandle =
        metadata.properties?.[0]?.name ??
        getTargetHandle(sourceType?.type || "", "constant");
      createNodeWithEdge(
        metadata,
        {
          x: event.clientX - 230,
          y: event.clientY - 170
        },
        "constant",
        targetHandle
      );
    },
    [constantNodeType, getMetadata, getTargetHandle, sourceType, createNodeWithEdge]
  );

  const handleOpenNodeMenu = useCallback((event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    openNodeMenu({
      x: getMousePosition().x,
      y: getMousePosition().y,
      dropType: sourceType?.type || "",
      connectDirection: "source"
    });
    closeContextMenu();
  }, [openNodeMenu, sourceType, closeContextMenu]);

  const handleCreatePreviewNode = useCallback((event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      createPreviewNode(event);
    }
    closeContextMenu();
  }, [createPreviewNode, closeContextMenu]);

  const handleCreateRerouteNode = useCallback((event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      createRerouteNode(event as React.MouseEvent);
    }
    closeContextMenu();
  }, [createRerouteNode, closeContextMenu]);

  const handleCreateOutputNode = useCallback((event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      createOutputNode(event);
    }
    closeContextMenu();
  }, [createOutputNode, closeContextMenu]);

  const handleCreateSaveNode = useCallback((event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      createSaveNode(event);
    }
    closeContextMenu();
  }, [createSaveNode, closeContextMenu]);

  const handleCreateConstantNode = useCallback((event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      createConstantNode(event);
    }
    closeContextMenu();
  }, [createConstantNode, closeContextMenu]);

  const handleShowConnectableNodes = (
    event?: React.MouseEvent<HTMLElement>
  ) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (menuPosition) {
      // When showing connectable nodes from an output handle,
      // we're looking for nodes with compatible inputs
      setSourceHandle(sourceHandle); // This output handle will be the source
      setNodeId(nodeId);
      setFilterType("input");
      setConnectableType(sourceType);
      showMenu({ x: menuPosition.x, y: menuPosition.y });
    }
    closeContextMenu();
  };

  if (!menuPosition) {return null;}
  return (
    <>
      <Menu
        className="context-menu output-context-menu"
        open={menuPosition !== null}
        onClose={closeContextMenu}
        onContextMenu={(event) => event.preventDefault()}
        anchorReference="anchorPosition"
        anchorPosition={
          menuPosition
            ? { top: menuPosition.y, left: menuPosition.x }
            : undefined
        }
        slotProps={{
          paper: {
            sx: {
              borderRadius: "12px",
              backgroundColor: theme.vars.palette.background.paper,
              border: `1px solid ${theme.vars.palette.divider}`,
              boxShadow: theme.shadows[8],
              minWidth: "220px",
              padding: "4px",
              "& .MuiDivider-root": {
                margin: "4px 0",
                borderColor: theme.vars.palette.divider
              }
            }
          }
        }}
        transitionDuration={200}
      >
        <ContextMenuItem
          onClick={handleCreatePreviewNode}
          label="Create Preview Node"
          addButtonClassName="create-preview-node"
          IconComponent={<VisibilityIcon />}
        />
        {outputNodeMetadata && (
          <ContextMenuItem
            onClick={handleCreateOutputNode}
            label="Create Output Node"
            addButtonClassName="create-output-node"
            IconComponent={<DataObjectIcon />}
          />
        )}
        <ContextMenuItem
          onClick={handleCreateRerouteNode}
          label="Create Reroute Node"
          addButtonClassName="create-reroute-node"
          IconComponent={<AltRouteIcon />}
        />
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
        {constantNodeType && (
          <ContextMenuItem
            onClick={handleCreateConstantNode}
            label="Create Constant Node"
            addButtonClassName="create-constant-node"
            IconComponent={<DataObjectIcon />}
          />
        )}
        <Divider />
        <ContextMenuItem
          onClick={handleShowConnectableNodes}
          label="Show Connectable Nodes"
          addButtonClassName="show-connectable-nodes"
          IconComponent={<HubIcon />}
        />
        <ContextMenuItem
          onClick={handleOpenNodeMenu}
          label="Open Filtered Menu"
          addButtonClassName="open-node-menu"
          IconComponent={<ListAltIcon />}
        />
      </Menu>
    </>
  );
};

export default memo(OutputContextMenu);

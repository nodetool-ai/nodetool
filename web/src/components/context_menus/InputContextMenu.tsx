import React, { useCallback, memo, useMemo } from "react";
//mui
import { Divider, Menu } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ContextMenuItem from "./ContextMenuItem";
//icons
import InputIcon from "@mui/icons-material/Input";
import PushPinIcon from "@mui/icons-material/PushPin";
import HubIcon from "@mui/icons-material/Hub";
import ListAltIcon from "@mui/icons-material/ListAlt";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { getMousePosition } from "../../utils/MousePosition";
import log from "loglevel";
import { labelForType } from "../../config/data_types";
import useMetadataStore from "../../stores/MetadataStore";
import { Edge, useReactFlow } from "@xyflow/react";
import { isCollectType, Slugify } from "../../utils/TypeHandler";
import useConnectableNodesStore from "../../stores/ConnectableNodesStore";
import { useNodes } from "../../contexts/NodeContext";

/**
 * Maps a type to the corresponding input and constant node type paths.
 * Returns null for types that don't have corresponding nodes.
 */
const getNodePathsForType = (
  typeName: string
): { inputPath: string; constantPath: string } | null => {
  const mapping: Record<string, { inputPath: string; constantPath: string }> = {
    str: {
      inputPath: "nodetool.input.StringInput",
      constantPath: "nodetool.constant.String"
    },
    int: {
      inputPath: "nodetool.input.IntegerInput",
      constantPath: "nodetool.constant.Integer"
    },
    float: {
      inputPath: "nodetool.input.FloatInput",
      constantPath: "nodetool.constant.Float"
    },
    bool: {
      inputPath: "nodetool.input.BooleanInput",
      constantPath: "nodetool.constant.Bool"
    },
    boolean: {
      inputPath: "nodetool.input.BooleanInput",
      constantPath: "nodetool.constant.Bool"
    },
    image: {
      inputPath: "nodetool.input.ImageInput",
      constantPath: "nodetool.constant.Image"
    },
    audio: {
      inputPath: "nodetool.input.AudioInput",
      constantPath: "nodetool.constant.Audio"
    },
    video: {
      inputPath: "nodetool.input.VideoInput",
      constantPath: "nodetool.constant.Video"
    },
    document: {
      inputPath: "nodetool.input.DocumentInput",
      constantPath: "nodetool.constant.Document"
    },
    dataframe: {
      inputPath: "nodetool.input.DataframeInput",
      constantPath: "nodetool.constant.DataFrame"
    },
    enum: {
      inputPath: "nodetool.input.SelectInput",
      constantPath: "nodetool.constant.Select"
    },
    // Model types
    language_model: {
      inputPath: "nodetool.input.LanguageModelInput",
      constantPath: "nodetool.constant.LanguageModelConstant"
    },
    image_model: {
      inputPath: "nodetool.input.ImageModelInput",
      constantPath: "nodetool.constant.ImageModelConstant"
    },
    video_model: {
      inputPath: "nodetool.input.VideoModelInput",
      constantPath: "nodetool.constant.VideoModelConstant"
    },
    tts_model: {
      inputPath: "nodetool.input.TTSModelInput",
      constantPath: "nodetool.constant.TTSModelConstant"
    },
    asr_model: {
      inputPath: "nodetool.input.ASRModelInput",
      constantPath: "nodetool.constant.ASRModelConstant"
    },
    embedding_model: {
      inputPath: "nodetool.input.EmbeddingModelInput",
      constantPath: "nodetool.constant.EmbeddingModelConstant"
    }
  };
  return mapping[typeName] ?? null;
};


const InputContextMenu: React.FC = () => {
  const theme = useTheme();
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const reactFlowInstance = useReactFlow();

  const { type, nodeId, handleId, menuPosition, closeContextMenu, payload } =
    useContextMenuStore((state) => ({
      type: state.type,
      nodeId: state.nodeId,
      handleId: state.handleId,
      menuPosition: state.menuPosition,
      closeContextMenu: state.closeContextMenu,
      payload: state.payload
    }));
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);

  // Use explicit mapping for type -> node paths instead of labelForType
  const nodePaths = useMemo(
    () => getNodePathsForType(type?.type || ""),
    [type?.type]
  );

  // Fallback to the old label-based approach for types not in the mapping
  const datatypeLabel = labelForType(type?.type || "").replaceAll(" ", "");
  const fallbackInputPath = `nodetool.input.${datatypeLabel}Input`;
  const fallbackConstantPath = `nodetool.constant.${datatypeLabel}`;

  const inputNodePath = nodePaths?.inputPath ?? fallbackInputPath;
  const constantNodePath = nodePaths?.constantPath ?? fallbackConstantPath;
  const inputNodeMetadata = getMetadata(inputNodePath);
  const constantNodeMetadata = getMetadata(constantNodePath);

  // Check if this is an enum type (for prefilling Select nodes)
  const isEnumType = type?.type === "enum";
  const {
    showMenu,
    setNodeId,
    setFilterType,
    setConnectableType,
    setTargetHandle
  } = useConnectableNodesStore((state) => ({
    showMenu: state.showMenu,
    setNodeId: state.setNodeId,
    setFilterType: state.setFilterType,
    setConnectableType: state.setTypeMetadata,
    setTargetHandle: state.setTargetHandle
  }));

  // "collect" handle: allow connecting T -> list[T] and multiple connections
  const isCollectHandleType = type ? isCollectType(type) : false;
  const collectElementType = isCollectHandleType ? type?.type_args?.[0] : undefined;
  const collectElementDatatypeLabel = collectElementType
    ? labelForType(collectElementType.type || "").replaceAll(" ", "")
    : "";
  const collectElementConstantNodePath = collectElementDatatypeLabel
    ? `nodetool.constant.${collectElementDatatypeLabel}`
    : "";
  const collectElementConstantNodeMetadata = collectElementConstantNodePath
    ? getMetadata(collectElementConstantNodePath)
    : null;
  const handleOpenNodeMenu = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      openNodeMenu({
        x: getMousePosition().x,
        y: getMousePosition().y,
        connectDirection: "target",
        dropType: type?.type || ""
      });
    },
    [openNodeMenu, type?.type]
  );
  const { createNode, addNode, edges, setEdges, generateEdgeId } = useNodes(
    (state) => ({
      createNode: state.createNode,
      addNode: state.addNode,
      edges: state.edges,
      setEdges: state.setEdges,
      generateEdgeId: state.generateEdgeId
    })
  );
  const createConstantNode = useCallback(
    (event: React.MouseEvent) => {
      if (!constantNodeMetadata) {return;}
      const isCollect = type ? isCollectType(type) : false;
      const newNode = createNode(
        constantNodeMetadata,
        reactFlowInstance.screenToFlowPosition({
          x: event.clientX - 250,
          y: event.clientY - 200
        })
      );
      newNode.data.size = {
        width: 200,
        height: 200
      };

      // For enum handles, prefill the Select node with enum identity and options
      if (isEnumType && type) {
        if (type.type_name) {
          newNode.data.properties.enum_type_name = type.type_name;
        }
        if (type.values && type.values.length > 0) {
          newNode.data.properties.options = type.values;
          // Default to first option
          newNode.data.properties.value = type.values[0];
        }
      }

      addNode(newNode);
      const validEdges = isCollect
        ? edges
        : edges.filter(
            (edge: Edge) =>
              !(edge.target === nodeId && edge.targetHandle === handleId)
          );
      const newEdge = {
        id: generateEdgeId(),
        source: newNode.id,
        target: nodeId || "",
        sourceHandle: "output",
        targetHandle: handleId,
        type: "default",
        className: Slugify(type?.type || "")
      };
      setEdges([...validEdges, newEdge]);
    },
    [
      constantNodeMetadata,
      createNode,
      reactFlowInstance,
      addNode,
      edges,
      generateEdgeId,
      nodeId,
      handleId,
      type,
      isEnumType,
      setEdges
    ]
  );

  const createCollectElementConstantNode = useCallback(
    (event: React.MouseEvent) => {
      if (!collectElementConstantNodeMetadata) {return;}
      const newNode = createNode(
        collectElementConstantNodeMetadata,
        reactFlowInstance.screenToFlowPosition({
          x: event.clientX - 250,
          y: event.clientY - 200
        })
      );
      newNode.data.size = {
        width: 200,
        height: 200
      };
      addNode(newNode);

      // For collect handles (list[T]), do not replace existing connections.
      const validEdges = edges;
      const newEdge = {
        id: generateEdgeId(),
        source: newNode.id,
        target: nodeId || "",
        sourceHandle: "output",
        targetHandle: handleId,
        type: "default",
        // Use element type for edge styling when connecting T -> list[T]
        className: Slugify(collectElementType?.type || type?.type || "")
      };
      setEdges([...validEdges, newEdge]);
    },
    [
      collectElementConstantNodeMetadata,
      createNode,
      reactFlowInstance,
      addNode,
      edges,
      generateEdgeId,
      nodeId,
      handleId,
      collectElementType?.type,
      type?.type,
      setEdges
    ]
  );

  const handleCreateConstantNode = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        createConstantNode(event);
      }
      log.info("Create Constant Node");
      closeContextMenu();
    },
    [createConstantNode, closeContextMenu]
  );

  const handleCreateCollectElementConstantNode = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        createCollectElementConstantNode(event);
      }
      closeContextMenu();
    },
    [createCollectElementConstantNode, closeContextMenu]
  );

  const createInputNode = useCallback(
    (event: React.MouseEvent) => {
      if (!inputNodeMetadata) {return;}
      const isCollect = type ? isCollectType(type) : false;
      const newNode = createNode(
        inputNodeMetadata,
        reactFlowInstance.screenToFlowPosition({
          x: event.clientX - 250,
          y: event.clientY - 200
        })
      );
      newNode.data.size = {
        width: 200,
        height: 200
      };
      if (handleId && newNode.data.properties.name !== undefined) {
        newNode.data.properties.name = handleId;
      }

      // For enum handles, prefill the SelectInput node with enum identity and options
      if (isEnumType && type) {
        if (type.type_name) {
          newNode.data.properties.enum_type_name = type.type_name;
        }
        if (type.values && type.values.length > 0) {
          newNode.data.properties.options = type.values;
          // Default to first option
          newNode.data.properties.value = type.values[0];
        }
      }

      // For int/float handles, inherit min/max/default from the source property if available
      const isNumericInput = inputNodePath === "nodetool.input.IntegerInput" || inputNodePath === "nodetool.input.FloatInput";
      if (isNumericInput && payload) {
        // Get min/max/default from payload (passed from connection handler)
        const { connectMin, connectMax, connectDefault } = payload as { connectMin?: number | null; connectMax?: number | null; connectDefault?: unknown };
        if (typeof connectMin === "number") {
          newNode.data.properties.min = connectMin;
        }
        if (typeof connectMax === "number") {
          newNode.data.properties.max = connectMax;
        }
        if (typeof connectDefault === "number") {
          newNode.data.properties.value = connectDefault;
        }
      }

      addNode(newNode);
      const validEdges = isCollect
        ? edges
        : edges.filter(
            (edge: Edge) =>
              !(edge.target === nodeId && edge.targetHandle === handleId)
          );
      const newEdge = {
        id: generateEdgeId(),
        source: newNode.id,
        target: nodeId || "",
        sourceHandle: "output",
        targetHandle: handleId,
        type: "default",
        className: Slugify(type?.type || "")
      };
      setEdges([...validEdges, newEdge]);
    },
    [
      inputNodeMetadata,
      createNode,
      reactFlowInstance,
      addNode,
      edges,
      generateEdgeId,
      nodeId,
      handleId,
      type,
      isEnumType,
      setEdges
    ]
  );

  const handleCreateInputNode = useCallback((event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      createInputNode(event);
    }
    closeContextMenu();
  }, [createInputNode, closeContextMenu]);

  const handleShowConnectableNodes = useCallback((
    event?: React.MouseEvent<HTMLElement>
  ) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (menuPosition) {
      // When showing connectable nodes from an input handle,
      // we're looking for nodes with compatible outputs
      setTargetHandle(handleId); // This input handle will be the target
      setNodeId(nodeId);
      setFilterType("output");
      setConnectableType(type);
      showMenu({ x: menuPosition.x, y: menuPosition.y });
    }
    closeContextMenu();
  }, [menuPosition, handleId, nodeId, type, setTargetHandle, setNodeId, setFilterType, setConnectableType, showMenu, closeContextMenu]);

  if (!menuPosition) {return null;}
  return (
    <>
      <Menu
        className="context-menu input-context-menu"
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
        {collectElementConstantNodeMetadata && (
          <ContextMenuItem
            onClick={handleCreateCollectElementConstantNode}
            label={`Create ${labelForType(collectElementType?.type || "")} Constant Node`}
            addButtonClassName="create-collect-element-constant-node"
            IconComponent={<PushPinIcon />}
          />
        )}
        {constantNodeMetadata && (
          <ContextMenuItem
            onClick={handleCreateConstantNode}
            label="Create Constant Node"
            addButtonClassName="create-constant-node"
            IconComponent={<PushPinIcon />}
          />
        )}
        {inputNodeMetadata && (
          <ContextMenuItem
            onClick={handleCreateInputNode}
            label="Create Input Node"
            addButtonClassName="create-input-node"
            IconComponent={<InputIcon />}
          />
        )}
        <Divider />
        <ContextMenuItem
          onClick={handleShowConnectableNodes}
          label="Show Connectable Nodes"
          addButtonClassName="show-connectable-nodes"
          IconComponent={<HubIcon />}
          tooltip={"Show nodes that can be connected to this input"}
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

export default memo(InputContextMenu);

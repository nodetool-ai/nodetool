import React, {
  useCallback,
  useEffect,
  useMemo,
  memo,
  useRef,
  useState
} from "react";
import { shallow } from "zustand/shallow";
//mui
import { InputAdornment, TextField } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Divider, Text, ToolbarIconButton, Box, ContextMenu, BORDER_RADIUS } from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
//icons
import PushPinIcon from "@mui/icons-material/PushPin";
import InputIcon from "@mui/icons-material/Input";
import EditNoteIcon from "@mui/icons-material/EditNote";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import { Edge, useReactFlow } from "@xyflow/react";
import useMetadataStore from "../../stores/MetadataStore";
import { NodeMetadata, TypeMetadata } from "../../stores/ApiTypes";
import { labelForType } from "../../config/data_types";
import { isCollectType, isConnectable, Slugify } from "../../utils/TypeHandler";
import { useNodes } from "../../contexts/NodeContext";
import { filterTypesByOutputType } from "../node_menu/typeFilterUtils";
import { rankSearchNodes } from "../../utils/nodeSearch";
import { useRecentNodesStore } from "../../stores/RecentNodesStore";
import NodeItem from "../node_menu/NodeItem";

const NODE_ROW_HEIGHT = 28;

/**
 * Maps a type to the corresponding input and constant node type paths.
 * Returns null for types that don't have corresponding nodes.
 * sourceHandle is optional - defaults to "output" if not specified.
 */
const NODE_PATHS_BY_TYPE: Record<
  string,
  { inputPath: string; constantPath: string; sourceHandle?: string }
> = {
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
  },
  image_size: {
    inputPath: "nodetool.input.ImageSizeInput",
    constantPath: "nodetool.constant.ImageSize",
    sourceHandle: "image_size"
  }
};

const getNodePathsForType = (
  typeName: string
): { inputPath: string; constantPath: string; sourceHandle?: string } | null =>
  NODE_PATHS_BY_TYPE[typeName] ?? null;

/**
 * Maps element type to specialized list constant node paths.
 */
const LIST_CONSTANT_PATHS: Record<
  string,
  { constantPath: string; inputPath: string; label: string }
> = {
  image: {
    constantPath: "nodetool.constant.ImageList",
    inputPath: "nodetool.input.ImageListInput",
    label: "Image List"
  },
  video: {
    constantPath: "nodetool.constant.VideoList",
    inputPath: "nodetool.input.VideoListInput",
    label: "Video List"
  },
  audio: {
    constantPath: "nodetool.constant.AudioList",
    inputPath: "nodetool.input.AudioListInput",
    label: "Audio List"
  },
  text: {
    constantPath: "nodetool.constant.TextList",
    inputPath: "nodetool.input.TextListInput",
    label: "Text List"
  },
  str: {
    constantPath: "nodetool.constant.TextList",
    inputPath: "nodetool.input.StringListInput",
    label: "Text List"
  }
};

const getListConstantPathForElementType = (
  elementTypeName: string
): { constantPath: string; inputPath: string; label: string } | null =>
  LIST_CONSTANT_PATHS[elementTypeName] ?? null;

const InputContextMenu: React.FC = () => {
  const theme = useTheme();
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const allMetadata = useMetadataStore((state) => state.metadata);
  const reactFlowInstance = useReactFlow();

  const { nodeId, handleId, menuPosition, closeContextMenu, type, payload } =
    useContextMenuStore(
      (state) => ({
        nodeId: state.nodeId,
        handleId: state.handleId,
        menuPosition: state.menuPosition,
        closeContextMenu: state.closeContextMenu,
        type: state.type,
        payload: state.payload
      }),
      shallow
    );

  const [searchTerm, setSearchTerm] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recentNodes = useRecentNodesStore((state) => state.recentNodes);
  const recentNodeTypes = useMemo(
    () => recentNodes.map((node) => node.nodeType),
    [recentNodes]
  );

  // "collect" handle: allow connecting T -> list[T] and multiple connections
  const isCollectHandleType = type ? isCollectType(type) : false;
  const collectElementType = isCollectHandleType
    ? type?.type_args?.[0]
    : undefined;

  const specializedListPaths = useMemo(() => {
    if (isCollectHandleType && collectElementType?.type) {
      return getListConstantPathForElementType(collectElementType.type);
    }
    return null;
  }, [isCollectHandleType, collectElementType?.type]);

  const nodePaths = useMemo(
    () => getNodePathsForType(type?.type || ""),
    [type?.type]
  );

  const datatypeLabel = labelForType(type?.type || "").replaceAll(" ", "");
  const fallbackInputPath = `nodetool.input.${datatypeLabel}Input`;
  const fallbackConstantPath = `nodetool.constant.${datatypeLabel}`;

  const inputNodePath =
    specializedListPaths?.inputPath ??
    nodePaths?.inputPath ??
    fallbackInputPath;
  const constantNodePath =
    specializedListPaths?.constantPath ??
    nodePaths?.constantPath ??
    fallbackConstantPath;
  const inputNodeMetadata = getMetadata(inputNodePath);
  const constantNodeMetadata = getMetadata(constantNodePath);
  const promptNodeMetadata =
    type?.type === "str" ? getMetadata("nodetool.text.Prompt") : null;

  const specializedListLabel = specializedListPaths?.label;

  const isEnumType = type?.type === "enum";

  const collectElementDatatypeLabel = collectElementType
    ? labelForType(collectElementType.type || "").replaceAll(" ", "")
    : "";
  const collectElementConstantNodePath = collectElementDatatypeLabel
    ? `nodetool.constant.${collectElementDatatypeLabel}`
    : "";
  const collectElementConstantNodeMetadata = collectElementConstantNodePath
    ? getMetadata(collectElementConstantNodePath)
    : null;

  const collectElementNodePaths = useMemo(() => {
    if (collectElementType?.type) {
      return getNodePathsForType(collectElementType.type);
    }
    return null;
  }, [collectElementType?.type]);
  const collectElementInputNodePath =
    collectElementNodePaths?.inputPath ??
    (collectElementDatatypeLabel
      ? `nodetool.input.${collectElementDatatypeLabel}Input`
      : "");
  const collectElementInputNodeMetadata = collectElementInputNodePath
    ? getMetadata(collectElementInputNodePath)
    : null;

  const { createNode, addNode, edges, setEdges, generateEdgeId } = useNodes(
    (state) => ({
      createNode: state.createNode,
      addNode: state.addNode,
      edges: state.edges,
      setEdges: state.setEdges,
      generateEdgeId: state.generateEdgeId
    }),
    shallow
  );

  /**
   * Compute placement to the LEFT of the menu anchor (mirror of
   * OutputContextMenu, which places to the right). The new node's input
   * handle should sit ~GAP_X_FLOW from the anchor.
   */
  const computeFlowPosition = useCallback(
    (anchor: { x: number; y: number }, metadata: NodeMetadata) => {
      const extMeta = metadata as NodeMetadata & {
        style?: { width?: number | string; height?: number | string };
      };
      const parseDim = (
        value: number | string | undefined,
        fallback: number
      ): number => {
        if (typeof value === "number") return value;
        if (typeof value === "string") return parseInt(value, 10) || fallback;
        return fallback;
      };
      const nodeWidth = parseDim(extMeta.style?.width, 200);
      const nodeHeight = parseDim(extMeta.style?.height, 200);
      const flowAnchor = reactFlowInstance.screenToFlowPosition(anchor);
      const GAP_X_FLOW = 40;
      return {
        x: flowAnchor.x - GAP_X_FLOW - nodeWidth,
        y: flowAnchor.y - nodeHeight / 2,
        width: nodeWidth,
        height: nodeHeight
      };
    },
    [reactFlowInstance]
  );

  const replaceTargetEdges = useCallback(
    (
      currentEdges: Edge[],
      replaceTarget: { nodeId: string; handleId: string } | null,
      isCollect: boolean
    ): Edge[] => {
      if (!replaceTarget || isCollect) {
        return currentEdges;
      }
      return currentEdges.filter(
        (edge) =>
          !(
            edge.target === replaceTarget.nodeId &&
            edge.targetHandle === replaceTarget.handleId
          )
      );
    },
    []
  );

  const createConstantNode = useCallback(
    (event: React.MouseEvent) => {
      if (!constantNodeMetadata) {
        return;
      }
      const isCollect = type ? isCollectType(type) : false;
      const placement = computeFlowPosition(
        { x: event.clientX, y: event.clientY },
        constantNodeMetadata
      );
      const newNode = createNode(constantNodeMetadata, {
        x: placement.x,
        y: placement.y
      });
      newNode.data.size = { width: placement.width, height: placement.height };

      if (isEnumType && type) {
        if (type.type_name) {
          newNode.data.properties.enum_type_name = type.type_name;
        }
        if (type.values && type.values.length > 0) {
          newNode.data.properties.options = type.values;
          newNode.data.properties.value = type.values[0];
        }
      }

      addNode(newNode);
      const validEdges = replaceTargetEdges(
        edges,
        nodeId && handleId ? { nodeId, handleId } : null,
        isCollect
      );
      setEdges([
        ...validEdges,
        {
          id: generateEdgeId(),
          source: newNode.id,
          target: nodeId || "",
          sourceHandle: nodePaths?.sourceHandle ?? "output",
          targetHandle: handleId,
          type: "default",
          className: Slugify(type?.type || "")
        }
      ]);
    },
    [
      constantNodeMetadata,
      computeFlowPosition,
      createNode,
      isEnumType,
      type,
      addNode,
      replaceTargetEdges,
      edges,
      nodeId,
      handleId,
      setEdges,
      generateEdgeId,
      nodePaths?.sourceHandle
    ]
  );

  const createInputNode = useCallback(
    (event: React.MouseEvent) => {
      if (!inputNodeMetadata) {
        return;
      }
      const isCollect = type ? isCollectType(type) : false;
      const placement = computeFlowPosition(
        { x: event.clientX, y: event.clientY },
        inputNodeMetadata
      );
      const newNode = createNode(inputNodeMetadata, {
        x: placement.x,
        y: placement.y
      });
      newNode.data.size = { width: placement.width, height: placement.height };

      if (handleId && newNode.data.properties.name !== undefined) {
        newNode.data.properties.name = handleId;
      }

      if (isEnumType && type) {
        if (type.type_name) {
          newNode.data.properties.enum_type_name = type.type_name;
        }
        if (type.values && type.values.length > 0) {
          newNode.data.properties.options = type.values;
          newNode.data.properties.value = type.values[0];
        }
      }

      const isNumericInput =
        inputNodePath === "nodetool.input.IntegerInput" ||
        inputNodePath === "nodetool.input.FloatInput";
      if (isNumericInput && payload) {
        const { connectMin, connectMax, connectDefault } = payload as {
          connectMin?: number | null;
          connectMax?: number | null;
          connectDefault?: unknown;
        };
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
      const validEdges = replaceTargetEdges(
        edges,
        nodeId && handleId ? { nodeId, handleId } : null,
        isCollect
      );
      setEdges([
        ...validEdges,
        {
          id: generateEdgeId(),
          source: newNode.id,
          target: nodeId || "",
          sourceHandle: "output",
          targetHandle: handleId,
          type: "default",
          className: Slugify(type?.type || "")
        }
      ]);
    },
    [
      inputNodeMetadata,
      computeFlowPosition,
      createNode,
      handleId,
      isEnumType,
      type,
      inputNodePath,
      payload,
      addNode,
      replaceTargetEdges,
      edges,
      nodeId,
      setEdges,
      generateEdgeId
    ]
  );

  const createPromptNode = useCallback(
    (event: React.MouseEvent) => {
      if (!promptNodeMetadata) {
        return;
      }
      const isCollect = type ? isCollectType(type) : false;
      const placement = computeFlowPosition(
        { x: event.clientX, y: event.clientY },
        promptNodeMetadata
      );
      const newNode = createNode(promptNodeMetadata, {
        x: placement.x,
        y: placement.y
      });
      newNode.data.size = { width: placement.width, height: placement.height };
      addNode(newNode);
      const validEdges = replaceTargetEdges(
        edges,
        nodeId && handleId ? { nodeId, handleId } : null,
        isCollect
      );
      setEdges([
        ...validEdges,
        {
          id: generateEdgeId(),
          source: newNode.id,
          target: nodeId || "",
          sourceHandle: "output",
          targetHandle: handleId,
          type: "default",
          className: Slugify(type?.type || "")
        }
      ]);
    },
    [
      promptNodeMetadata,
      computeFlowPosition,
      createNode,
      type,
      addNode,
      replaceTargetEdges,
      edges,
      nodeId,
      handleId,
      setEdges,
      generateEdgeId
    ]
  );

  const createCollectElementConstantNode = useCallback(
    (event: React.MouseEvent) => {
      if (!collectElementConstantNodeMetadata) {
        return;
      }
      const placement = computeFlowPosition(
        { x: event.clientX, y: event.clientY },
        collectElementConstantNodeMetadata
      );
      const newNode = createNode(collectElementConstantNodeMetadata, {
        x: placement.x,
        y: placement.y
      });
      newNode.data.size = { width: placement.width, height: placement.height };
      addNode(newNode);
      setEdges([
        ...edges,
        {
          id: generateEdgeId(),
          source: newNode.id,
          target: nodeId || "",
          sourceHandle: "output",
          targetHandle: handleId,
          type: "default",
          className: Slugify(collectElementType?.type || type?.type || "")
        }
      ]);
    },
    [
      collectElementConstantNodeMetadata,
      computeFlowPosition,
      createNode,
      addNode,
      edges,
      setEdges,
      generateEdgeId,
      nodeId,
      handleId,
      collectElementType?.type,
      type?.type
    ]
  );

  const createCollectElementInputNode = useCallback(
    (event: React.MouseEvent) => {
      if (!collectElementInputNodeMetadata) {
        return;
      }
      const placement = computeFlowPosition(
        { x: event.clientX, y: event.clientY },
        collectElementInputNodeMetadata
      );
      const newNode = createNode(collectElementInputNodeMetadata, {
        x: placement.x,
        y: placement.y
      });
      newNode.data.size = { width: placement.width, height: placement.height };
      if (handleId && newNode.data.properties.name !== undefined) {
        newNode.data.properties.name = handleId;
      }
      addNode(newNode);
      setEdges([
        ...edges,
        {
          id: generateEdgeId(),
          source: newNode.id,
          target: nodeId || "",
          sourceHandle: "output",
          targetHandle: handleId,
          type: "default",
          className: Slugify(collectElementType?.type || type?.type || "")
        }
      ]);
    },
    [
      collectElementInputNodeMetadata,
      computeFlowPosition,
      createNode,
      addNode,
      edges,
      setEdges,
      generateEdgeId,
      nodeId,
      handleId,
      collectElementType?.type,
      type?.type
    ]
  );

  const handleCreateConstantNode = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        createConstantNode(event);
      }
      closeContextMenu();
    },
    [createConstantNode, closeContextMenu]
  );

  const handleCreateInputNode = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        createInputNode(event);
      }
      closeContextMenu();
    },
    [createInputNode, closeContextMenu]
  );

  const handleCreatePromptNode = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        createPromptNode(event);
      }
      closeContextMenu();
    },
    [createPromptNode, closeContextMenu]
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

  const handleCreateCollectElementInputNode = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        createCollectElementInputNode(event);
      }
      closeContextMenu();
    },
    [createCollectElementInputNode, closeContextMenu]
  );

  /**
   * Connectable nodes: nodes whose outputs are compatible with this input's
   * type. Matches the source-side equivalent in OutputContextMenu (which
   * filters by what the source's output can plug into).
   */
  const connectableNodes = useMemo(() => {
    if (!type) {
      return [];
    }
    return filterTypesByOutputType(Object.values(allMetadata), type);
  }, [allMetadata, type]);

  const rankedConnectableNodes = useMemo(
    () => rankSearchNodes(connectableNodes, searchTerm, recentNodeTypes),
    [connectableNodes, recentNodeTypes, searchTerm]
  );

  const virtualizer = useVirtualizer({
    count: rankedConnectableNodes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => NODE_ROW_HEIGHT,
    initialRect: { height: 160, width: 320 },
    overscan: theme.virtualScroll.overscan.normal,
    getItemKey: (index) => rankedConnectableNodes[index]?.node_type ?? index
  });

  const getPreferredConnectableOutput = useCallback(
    (metadata: NodeMetadata): string | null => {
      if (!type) {
        return null;
      }
      const outputs = metadata.outputs ?? [];
      const compatible = outputs.filter((output) =>
        isConnectable(output.type, type as TypeMetadata, true)
      );
      if (compatible.length === 0) {
        return null;
      }
      // Prefer exact type match over generic
      const exact = compatible.find((o) => o.type.type === type.type);
      return (exact ?? compatible[0]).name;
    },
    [type]
  );

  const handleConnectableNodeClick = useCallback(
    (metadata: NodeMetadata) => {
      if (!menuPosition) {
        return;
      }
      const anchorPosition =
        (payload as { dropPosition?: { x: number; y: number } } | null)
          ?.dropPosition ?? menuPosition;
      const outputName = getPreferredConnectableOutput(metadata);
      if (!outputName) {
        return;
      }
      const isCollect = type ? isCollectType(type) : false;
      const placement = computeFlowPosition(anchorPosition, metadata);
      const newNode = createNode(metadata, {
        x: placement.x,
        y: placement.y
      });
      newNode.data.size = { width: placement.width, height: placement.height };
      addNode(newNode);
      const validEdges = replaceTargetEdges(
        edges,
        nodeId && handleId ? { nodeId, handleId } : null,
        isCollect
      );
      setEdges([
        ...validEdges,
        {
          id: generateEdgeId(),
          source: newNode.id,
          target: nodeId || "",
          sourceHandle: outputName,
          targetHandle: handleId,
          type: "default",
          className: Slugify(type?.type || "")
        }
      ]);
      closeContextMenu();
    },
    [
      menuPosition,
      payload,
      getPreferredConnectableOutput,
      type,
      computeFlowPosition,
      createNode,
      addNode,
      replaceTargetEdges,
      edges,
      nodeId,
      handleId,
      setEdges,
      generateEdgeId,
      closeContextMenu
    ]
  );

  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setSearchTerm(event.target.value);
    },
    []
  );

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        closeContextMenu();
      } else {
        event.stopPropagation();
      }
    },
    [closeContextMenu]
  );

  const handleClearSearch = useCallback(() => {
    setSearchTerm("");
  }, []);

  const handleDragStart = useCallback(
    (_node: NodeMetadata, _event: React.DragEvent<HTMLDivElement>) => {},
    []
  );

  useEffect(() => {
    if (!menuPosition) {
      return;
    }
    const timeout = window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [menuPosition]);

  const showStaticActions = searchTerm.trim().length === 0;

  const actionRowStyles = {
    alignItems: "center",
    backgroundColor: "transparent",
    border: 0,
    borderRadius: "var(--rounded-md)",
    color: "text.primary",
    cursor: "pointer",
    display: "flex",
    font: "inherit",
    gap: "0.5em",
    margin: 0,
    minHeight: "28px",
    padding: "2px 6px",
    textAlign: "left",
    width: "100%",
    "&:hover": { backgroundColor: theme.vars.palette.action.hover },
    ".icon-bg": {
      alignItems: "center",
      backgroundColor: theme.vars.palette.grey[900],
      borderRadius: `0 0 ${BORDER_RADIUS.xs} 0`,
      boxShadow: `inset 1px 1px 2px ${theme.vars.palette.action.disabledBackground}`,
      display: "flex",
      flexShrink: 0,
      height: "18px",
      justifyContent: "center",
      padding: "2px",
      width: "18px"
    },
    ".icon-bg svg": {
      color: theme.vars.palette.grey[100],
      height: "13px",
      width: "13px"
    }
  };

  if (!menuPosition) {
    return null;
  }

  const constantLabel = specializedListLabel
    ? `Create ${specializedListLabel}`
    : "Constant";
  const inputLabel = specializedListLabel
    ? `Create ${specializedListLabel} Input`
    : "Input";

  return (
    <ContextMenu
      className="context-menu input-context-menu"
      open={menuPosition !== null}
      onClose={closeContextMenu}
      onContextMenu={(event) => event.preventDefault()}
      position={menuPosition}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      marginThreshold={0}
      paperSx={{
        borderRadius: "var(--rounded-xl)",
        backgroundColor: theme.vars.palette.background.paper,
        border: `1px solid ${theme.vars.palette.divider}`,
        boxShadow: theme.shadows[8],
        maxHeight: `calc(100vh - ${menuPosition.y}px)`,
        minWidth: "320px",
        overflow: "hidden",
        padding: "4px",
        "& .MuiDivider-root": {
          margin: "4px 0",
          borderColor: theme.vars.palette.divider
        }
      }}
      transitionDuration={200}
    >
      <Box sx={{ px: 1, py: 0.5 }}>
        <TextField
          inputRef={searchInputRef}
          size="small"
          fullWidth
          placeholder="Search nodes..."
          value={searchTerm}
          onChange={handleSearchChange}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={handleSearchKeyDown}
          aria-label="Search connectable nodes"
          sx={{
            "& .MuiOutlinedInput-root": {
              backgroundColor: "action.disabledBackground",
              borderRadius: "var(--rounded-md)",
              fontSize: "var(--fontSizeSmall)",
              height: 30,
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: "action.selected"
              },
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: "action.focus"
              },
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                borderColor: theme.vars.palette.primary.main
              }
            },
            "& .MuiInputBase-input": {
              fontSize: "var(--fontSizeSmall)",
              py: 0.5
            }
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon
                    sx={{ color: "action.disabled", fontSize: 16 }}
                  />
                </InputAdornment>
              ),
              endAdornment: searchTerm ? (
                <InputAdornment position="end">
                  <ToolbarIconButton
                    aria-label="clear search"
                    onClick={handleClearSearch}
                    size="small"
                    icon={<ClearIcon sx={{ fontSize: 16 }} />}
                    nodrag={false}
                  />
                </InputAdornment>
              ) : null
            }
          }}
        />
      </Box>
      {showStaticActions && (
        <Box sx={{ px: 1, py: 0.5 }}>
          {collectElementConstantNodeMetadata && (
            <Box
              component="button"
              type="button"
              className="create-collect-element-constant-node"
              onClick={handleCreateCollectElementConstantNode}
              sx={actionRowStyles}
            >
              <span className="icon-bg">
                <PushPinIcon />
              </span>
              <Text size="small">
                {`Create ${labelForType(collectElementType?.type || "")} Constant`}
              </Text>
            </Box>
          )}
          {collectElementInputNodeMetadata && (
            <Box
              component="button"
              type="button"
              className="create-collect-element-input-node"
              onClick={handleCreateCollectElementInputNode}
              sx={actionRowStyles}
            >
              <span className="icon-bg">
                <InputIcon />
              </span>
              <Text size="small">
                {`Create ${labelForType(collectElementType?.type || "")} Input`}
              </Text>
            </Box>
          )}
          {constantNodeMetadata && (
            <Box
              component="button"
              type="button"
              className="create-constant-node"
              onClick={handleCreateConstantNode}
              sx={actionRowStyles}
            >
              <span className="icon-bg">
                <PushPinIcon />
              </span>
              <Text size="small">{constantLabel}</Text>
            </Box>
          )}
          {inputNodeMetadata && (
            <Box
              component="button"
              type="button"
              className="create-input-node"
              onClick={handleCreateInputNode}
              sx={actionRowStyles}
            >
              <span className="icon-bg">
                <InputIcon />
              </span>
              <Text size="small">{inputLabel}</Text>
            </Box>
          )}
          {promptNodeMetadata && (
            <Box
              component="button"
              type="button"
              className="create-prompt-node"
              onClick={handleCreatePromptNode}
              sx={actionRowStyles}
            >
              <span className="icon-bg">
                <EditNoteIcon />
              </span>
              <Text size="small">Prompt</Text>
            </Box>
          )}
        </Box>
      )}
      {showStaticActions && <Divider />}
      <Box
        ref={scrollRef}
        sx={{
          maxHeight: 360,
          minHeight: rankedConnectableNodes.length === 0 ? 80 : 160,
          overflowX: "hidden",
          overflowY: "auto",
          px: 0,
          "& .node-item-container": { py: 0 },
          "& .node": {
            margin: 0,
            padding: "0 2px",
            borderRadius: "var(--rounded-md)",
            cursor: "pointer",
            "&:hover": { backgroundColor: theme.vars.palette.action.hover },
            ".node-button": { padding: 0 },
            ".icon-bg": { padding: 0, width: "16px", height: "16px" },
            ".icon-bg svg": {
              fontSize: "var(--fontSizeSmall)",
              width: "12px",
              height: "12px"
            }
          }
        }}
      >
        {rankedConnectableNodes.length === 0 ? (
          <Box sx={{ p: 2, textAlign: "center", color: "text.secondary" }}>
            <Text size="small">
              No nodes match &quot;{searchTerm}&quot;.
            </Text>
          </Box>
        ) : (
          <Box
            sx={{
              height: virtualizer.getTotalSize(),
              position: "relative",
              width: "100%"
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const nodeMetadata = rankedConnectableNodes[virtualItem.index];
              if (!nodeMetadata) {
                return null;
              }
              return (
                <div
                  className="node-item-container"
                  key={virtualItem.key}
                  style={{
                    height: virtualItem.size,
                    left: 0,
                    position: "absolute",
                    top: 0,
                    transform: `translateY(${virtualItem.start}px)`,
                    width: "100%"
                  }}
                >
                  <NodeItem
                    node={nodeMetadata}
                    onDragStart={handleDragStart}
                    onClick={handleConnectableNodeClick}
                    showFavoriteButton={false}
                  />
                </div>
              );
            })}
          </Box>
        )}
      </Box>
    </ContextMenu>
  );
};

export default memo(InputContextMenu);

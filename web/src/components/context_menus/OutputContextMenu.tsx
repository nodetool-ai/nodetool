import React, { useCallback, useEffect, useMemo, memo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";
//mui
import { Box, InputAdornment, Menu, TextField } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Divider, Text, ToolbarIconButton } from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
//icons
import VisibilityIcon from "@mui/icons-material/Visibility";
import DataObjectIcon from "@mui/icons-material/DataObject";
import AltRouteIcon from "@mui/icons-material/AltRoute";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useReactFlow } from "@xyflow/react";
import useMetadataStore from "../../stores/MetadataStore";
import { NodeMetadata } from "../../stores/ApiTypes";
import { labelForType } from "../../config/data_types";
import { isConnectable, Slugify } from "../../utils/TypeHandler";
import { useNodes } from "../../contexts/NodeContext";
import { filterTypesByInputType } from "../node_menu/typeFilterUtils";
import { rankSearchNodes } from "../../utils/nodeSearch";
import { useRecentNodesStore } from "../../stores/RecentNodesStore";
import NodeItem from "../node_menu/NodeItem";

const NODE_ROW_HEIGHT = 28;

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
  const allMetadata = useMetadataStore((state) => state.metadata);
  const [searchTerm, setSearchTerm] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recentNodeTypes = useRecentNodesStore((state) =>
    state.recentNodes.map((node) => node.nodeType)
  );

  const outputNodeMetadata = useMemo(
    () => getMetadata("nodetool.output.Output"),
    [getMetadata]
  );

  const saveNodeMetadata = useMemo(() => {
    if (!sourceType || sourceType.type === "") return undefined;
    const datatypeLabel = labelForType(sourceType.type).replaceAll(" ", "");
    const adjustedLabel = datatypeLabel === "String" ? "Text" : datatypeLabel;
    const saveNodePath = `nodetool.${adjustedLabel.toLowerCase()}.Save${adjustedLabel}`;
    return getMetadata(saveNodePath);
  }, [sourceType, getMetadata]);



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

  const createNodeWithEdge = useCallback(
    (
      metadata: unknown,
      position: { x: number; y: number },
      nodeType: string,
      targetHandle: string | null = null
    ) => {
      if (!metadata) {
        console.info("Metadata is undefined, cannot create node.");
        return;
      }

      const newNode = createNode(
        metadata as NodeMetadata,
        reactFlowInstance.screenToFlowPosition({
          x: position.x + 150,
          y: position.y
        })
      );

      if (targetHandle) {
        newNode.data.dynamic_properties[targetHandle] = true;
      }

      const extendedMetadata = metadata as NodeMetadata & { style?: unknown };
      if (extendedMetadata.style) {
        newNode.style = extendedMetadata.style as React.CSSProperties;
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

  const connectableNodes = useMemo(() => {
    if (!sourceType) {
      return [];
    }
    return filterTypesByInputType(Object.values(allMetadata), sourceType);
  }, [allMetadata, sourceType]);

  const rankedConnectableNodes = useMemo(
    () => rankSearchNodes(connectableNodes, searchTerm, recentNodeTypes),
    [connectableNodes, recentNodeTypes, searchTerm]
  );

  const virtualizer = useVirtualizer({
    count: rankedConnectableNodes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => NODE_ROW_HEIGHT,
    initialRect: { height: 160, width: 320 },
    overscan: 12,
    getItemKey: (index) => rankedConnectableNodes[index]?.node_type ?? index
  });

  const getPreferredConnectableInput = useCallback(
    (metadata: NodeMetadata) => {
      if (!sourceType) {
        return null;
      }
      const compatibleProperties = (metadata.properties || []).filter(
        (property) => isConnectable(sourceType, property.type, true)
      );
      if (compatibleProperties.length === 0) {
        return null;
      }
      const basicFields = metadata.basic_fields || [];
      return (
        compatibleProperties.find((property) =>
          basicFields.includes(property.name)
        ) || compatibleProperties[0]
      );
    },
    [sourceType]
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

  const handleConnectableNodeClick = useCallback(
    (metadata: NodeMetadata) => {
      if (!menuPosition) {
        return;
      }
      const property = getPreferredConnectableInput(metadata);
      if (!property) {
        return;
      }
      createNodeWithEdge(metadata, menuPosition, "connectable", property.name);
      closeContextMenu();
    },
    [closeContextMenu, createNodeWithEdge, getPreferredConnectableInput, menuPosition]
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

  const saveLabel = `Save${
    sourceType?.type === "string"
      ? "Text"
      : sourceType?.type_name
      ? sourceType.type_name?.charAt(0).toUpperCase() +
        sourceType.type_name?.slice(1)
      : ""
  }`;
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
    padding: "1px 6px",
    textAlign: "left",
    width: "100%",
    "&:hover": { backgroundColor: theme.vars.palette.action.hover },
    ".icon-bg": {
      alignItems: "center",
      backgroundColor: theme.vars.palette.grey[900],
      borderRadius: "0 0 3px 0",
      boxShadow: `inset 1px 1px 2px ${theme.vars.palette.action.disabledBackground}`,
      display: "flex",
      flexShrink: 0,
      height: "18px",
      justifyContent: "center",
      padding: "1px",
      width: "18px"
    },
    ".icon-bg svg": {
      color: theme.vars.palette.grey[100],
      height: "13px",
      width: "13px"
    }
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
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        marginThreshold={0}
        slotProps={{
          paper: {
            sx: {
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
            }
          }
        }}
        transitionDuration={200}
      >
        <Box sx={{ px: 0.75, py: 0.25 }}>
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
                py: 0.25
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
          <Box sx={{ px: 0.75, py: 0.1 }}>
            <Box
            component="button"
            type="button"
            className="create-preview-node"
            onClick={handleCreatePreviewNode}
            sx={actionRowStyles}
          >
            <span className="icon-bg"><VisibilityIcon /></span>
            <Text size="small">Preview</Text>
          </Box>
          {outputNodeMetadata != null && (
            <Box
              component="button"
              type="button"
              className="create-output-node"
              onClick={handleCreateOutputNode}
              sx={actionRowStyles}
            >
              <span className="icon-bg"><DataObjectIcon /></span>
              <Text size="small">Output</Text>
            </Box>
          )}
          <Box
            component="button"
            type="button"
            className="create-reroute-node"
            onClick={handleCreateRerouteNode}
            sx={actionRowStyles}
          >
            <span className="icon-bg"><AltRouteIcon /></span>
            <Text size="small">Reroute</Text>
          </Box>
            {saveNodeMetadata != null && (
              <Box
                component="button"
                type="button"
                className="create-save-node"
                onClick={handleCreateSaveNode}
                sx={actionRowStyles}
              >
                <span className="icon-bg"><SaveAltIcon /></span>
                <Text size="small">{saveLabel}</Text>
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
              ".icon-bg svg": { fontSize: "0.75rem", width: "12px", height: "12px" }
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
      </Menu>
    </>
  );
};

export default memo(OutputContextMenu);

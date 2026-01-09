/**
 * Canvas Panel
 *
 * The main editing canvas that renders the live MUI components.
 * Supports click-to-select and inline text editing.
 */

import React, { useCallback, useMemo } from "react";
import { Box, Paper, Typography, IconButton, Stack, Tooltip } from "@mui/material";
import {
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  CenterFocusStrong as FitIcon,
  Undo as UndoIcon,
  Redo as RedoIcon,
} from "@mui/icons-material";
import { ComponentRenderer } from "./ComponentRenderer";
import { useWysiwygEditorStore, useWysiwygHistory } from "../hooks/useWysiwygEditorStore";
import { countNodes } from "../utils/schemaUtils";

/**
 * Zoom levels
 */
const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const DEFAULT_ZOOM = 1;

/**
 * Canvas Panel component
 */
export const Canvas: React.FC = () => {
  const {
    schema,
    selectedNodeId,
    hoveredNodeId,
    isEditing,
    selectNode,
    setHoveredNode,
    setEditing,
    updateNode,
  } = useWysiwygEditorStore();

  const { undo, redo, canUndo, canRedo } = useWysiwygHistory();

  const [zoom, setZoom] = React.useState(DEFAULT_ZOOM);

  // Handle click on a node
  const handleNodeClick = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      selectNode(nodeId);
      setEditing(false);
    },
    [selectNode, setEditing]
  );

  // Handle double-click for inline editing
  const handleNodeDoubleClick = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      selectNode(nodeId);
      setEditing(true);
    },
    [selectNode, setEditing]
  );

  // Handle text change from inline editing
  const handleTextChange = useCallback(
    (nodeId: string, text: string) => {
      updateNode(nodeId, { text });
      setEditing(false);
    },
    [updateNode, setEditing]
  );

  // Handle hover - handleMouseEnter is intentionally defined for future use
  const _handleMouseEnter = useCallback(
    (nodeId: string) => {
      setHoveredNode(nodeId);
    },
    [setHoveredNode]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, [setHoveredNode]);

  // Handle canvas click (deselect)
  const handleCanvasClick = useCallback(() => {
    selectNode(null);
    setEditing(false);
  }, [selectNode, setEditing]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    const currentIndex = ZOOM_LEVELS.indexOf(zoom);
    if (currentIndex < ZOOM_LEVELS.length - 1) {
      setZoom(ZOOM_LEVELS[currentIndex + 1]);
    }
  }, [zoom]);

  const handleZoomOut = useCallback(() => {
    const currentIndex = ZOOM_LEVELS.indexOf(zoom);
    if (currentIndex > 0) {
      setZoom(ZOOM_LEVELS[currentIndex - 1]);
    }
  }, [zoom]);

  const handleFit = useCallback(() => {
    setZoom(DEFAULT_ZOOM);
  }, []);

  // Node count for performance indicator
  const nodeCount = useMemo(() => countNodes(schema.root), [schema.root]);

  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backgroundColor: "grey.100",
      }}
    >
      {/* Toolbar */}
      <Paper
        elevation={0}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 1,
          py: 0.5,
          borderBottom: 1,
          borderColor: "divider",
          backgroundColor: "background.paper",
        }}
      >
        <Stack direction="row" spacing={0.5} alignItems="center">
          {/* Undo/Redo */}
          <Tooltip title="Undo">
            <span>
              <IconButton size="small" onClick={() => undo()} disabled={!canUndo}>
                <UndoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Redo">
            <span>
              <IconButton size="small" onClick={() => redo()} disabled={!canRedo}>
                <RedoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>

        {/* Node count */}
        <Typography variant="caption" color="text.secondary">
          {nodeCount} / 200 nodes
        </Typography>

        <Stack direction="row" spacing={0.5} alignItems="center">
          {/* Zoom controls */}
          <Tooltip title="Zoom out">
            <IconButton size="small" onClick={handleZoomOut} disabled={zoom === ZOOM_LEVELS[0]}>
              <ZoomOutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Typography variant="caption" sx={{ minWidth: 40, textAlign: "center" }}>
            {Math.round(zoom * 100)}%
          </Typography>
          <Tooltip title="Zoom in">
            <IconButton
              size="small"
              onClick={handleZoomIn}
              disabled={zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
            >
              <ZoomInIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Reset zoom">
            <IconButton size="small" onClick={handleFit}>
              <FitIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Paper>

      {/* Canvas area */}
      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          p: 2,
          backgroundColor: (theme) =>
            theme.palette.mode === "dark" ? "grey.900" : "grey.100",
        }}
        onClick={handleCanvasClick}
      >
        {/* Canvas wrapper for zoom */}
        <Box
          sx={{
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
            minWidth: `${100 / zoom}%`,
            minHeight: `${100 / zoom}%`,
          }}
        >
          {/* Rendered content */}
          <Paper
            elevation={2}
            sx={{
              minHeight: 400,
              backgroundColor: "background.paper",
              position: "relative",
            }}
            onMouseLeave={handleMouseLeave}
          >
            <ComponentRenderer
              node={schema.root}
              isEditing={isEditing}
              onClick={handleNodeClick}
              onDoubleClick={handleNodeDoubleClick}
              onTextChange={handleTextChange}
              selectedNodeId={selectedNodeId}
              hoveredNodeId={hoveredNodeId}
              showOverlay={true}
            />

            {/* Keyboard shortcut hint */}
            {!selectedNodeId && (
              <Box
                sx={{
                  position: "absolute",
                  bottom: 8,
                  right: 8,
                  opacity: 0.5,
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  Click to select • Double-click to edit text • Delete to remove
                </Typography>
              </Box>
            )}
          </Paper>
        </Box>
      </Box>
    </Box>
  );
};

export default Canvas;

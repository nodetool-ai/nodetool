/**
 * Interactive Graph Visual Diff Component
 *
 * Enhanced visual diff with interactive node selection, zoom/pan,
 * and detailed change information on hover/click.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  Chip,
  useTheme,
  Zoom,
  Fade
} from "@mui/material";
import {
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  CenterFocusStrong as CenterIcon,
  Info as InfoIcon
} from "@mui/icons-material";
import { GraphDiff } from "../../utils/graphDiff";
import { Graph, Node } from "../../stores/ApiTypes";

interface InteractiveGraphVisualDiffProps {
  diff: GraphDiff;
  oldGraph?: Graph | null;
  newGraph?: Graph | null;
  width?: number;
  height?: number;
  onNodeSelect?: (nodeId: string, status: "added" | "removed" | "modified" | "unchanged") => void;
}

interface MiniNodeProps {
  node: Node;
  x: number;
  y: number;
  status: "added" | "removed" | "modified" | "unchanged";
  width: number;
  height: number;
  isSelected: boolean;
  onClick: () => void;
  onHover: (isHovered: boolean) => void;
}

const InteractiveMiniNode: React.FC<MiniNodeProps> = ({
  node,
  x,
  y,
  status,
  width,
  height,
  isSelected,
  onClick,
  onHover
}) => {
  const theme = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  const colors = {
    added: {
      bg: theme.palette.success.light,
      border: theme.palette.success.main,
      text: theme.palette.success.dark
    },
    removed: {
      bg: theme.palette.error.light,
      border: theme.palette.error.main,
      text: theme.palette.error.dark
    },
    modified: {
      bg: theme.palette.warning.light,
      border: theme.palette.warning.main,
      text: theme.palette.warning.dark
    },
    unchanged: {
      bg: theme.palette.action.hover,
      border: theme.palette.divider,
      text: theme.palette.text.secondary
    }
  };

  const color = colors[status];
  const nodeType = node.type?.split(".").pop() || "Node";

  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={onClick}
      onMouseEnter={() => {
        setIsHovered(true);
        onHover(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        onHover(false);
      }}
      style={{ cursor: "pointer" }}
    >
      {/* Node shadow for depth */}
      <rect
        x={2}
        y={2}
        width={width}
        height={height}
        rx={4}
        fill="rgba(0,0,0,0.1)"
      />
      {/* Main node */}
      <rect
        width={width}
        height={height}
        rx={4}
        fill={color.bg}
        stroke={color.border}
        strokeWidth={isSelected ? 3 : status !== "unchanged" ? 2 : 1}
        opacity={status === "removed" ? 0.5 : 1}
      />
      {/* Selection indicator */}
      {isSelected && (
        <rect
          x={-2}
          y={-2}
          width={width + 4}
          height={height + 4}
          rx={6}
          fill="none"
          stroke={theme.palette.primary.main}
          strokeWidth={2}
          strokeDasharray="4,2"
        />
      )}
      {/* Status indicator dot */}
      {status !== "unchanged" && (
        <circle
          cx={width}
          cy={0}
          r={5}
          fill={color.border}
          stroke={color.bg}
          strokeWidth={1}
        />
      )}
      {/* Node label */}
      <text
        x={width / 2}
        y={height / 2 + 4}
        textAnchor="middle"
        fill={color.text}
        fontSize={10}
        fontWeight={status !== "unchanged" || isSelected ? "bold" : "normal"}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {nodeType.length > 8 ? nodeType.slice(0, 6) + ".." : nodeType}
      </text>
      {/* Hover overlay */}
      {isHovered && (
        <rect
          width={width}
          height={height}
          rx={4}
          fill="white"
          fillOpacity={0.1}
          stroke={theme.palette.primary.main}
          strokeWidth={1}
        />
      )}
    </g>
  );
};

const InteractiveMiniEdge: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  status: "added" | "removed" | "unchanged";
  isHighlighted: boolean;
}> = ({ x1, y1, x2, y2, status, isHighlighted }) => {
  const theme = useTheme();
  const colorMap = {
    added: theme.palette.success.main,
    removed: theme.palette.error.main,
    unchanged: theme.palette.text.disabled
  };
  const color = colorMap[status];
  const strokeWidth = isHighlighted ? 3 : status !== "unchanged" ? 2 : 1;
  const opacity = status === "removed" ? 0.4 : isHighlighted ? 1 : 0.6;

  // Calculate edge direction for arrow
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={strokeWidth}
        opacity={opacity}
        strokeDasharray={status === "removed" ? "4,2" : "none"}
        markerEnd={`url(#arrowhead-${status})`}
      />
      {isHighlighted && status !== "unchanged" && (
        <circle
          cx={midX}
          cy={midY}
          r={4}
          fill={color}
          stroke={theme.palette.background.paper}
          strokeWidth={1}
        />
      )}
    </g>
  );
};

export const InteractiveGraphVisualDiff: React.FC<InteractiveGraphVisualDiffProps> = ({
  diff,
  oldGraph,
  newGraph,
  width = 400,
  height = 300,
  onNodeSelect
}) => {
  const theme = useTheme();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Compute layout
  const layout = useMemo(() => {
    if (!newGraph?.nodes && !oldGraph?.nodes) {
      return { positions: {} as Record<string, { x: number; y: number }>, edges: [], nodeWidth: 70, nodeHeight: 35 };
    }

    const allNodes = [...(newGraph?.nodes || []), ...(oldGraph?.nodes || [])];
    const uniqueNodes = Array.from(new Map(allNodes.map(n => [n.id, n])).values());
    const nodeCount = uniqueNodes.length;

    const cols = Math.ceil(Math.sqrt(nodeCount));
    const nodeWidth = 70;
    const nodeHeight = 35;
    const gapX = 15;
    const gapY = 15;
    const padding = 30;

    const gridWidth = cols * (nodeWidth + gapX) - gapX;
    const startX = (width - gridWidth) / 2 + nodeWidth / 2;
    const startY = padding + nodeHeight / 2;

    const positions: Record<string, { x: number; y: number }> = {};
    uniqueNodes.forEach((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      positions[node.id] = {
        x: startX + col * (nodeWidth + gapX),
        y: startY + row * (nodeHeight + gapY)
      };
    });

    // Compute edges with positions
    const edges: Array<{
      id: string;
      source: string;
      target: string;
      status: "added" | "removed" | "unchanged";
    }> = [];

    const oldEdgeKeys = new Set(
      (oldGraph?.edges || []).map(e => `${e.source}:${e.target}`)
    );
    const newEdgeKeys = new Set(
      (newGraph?.edges || []).map(e => `${e.source}:${e.target}`)
    );

    (newGraph?.edges || []).forEach(edge => {
      const key = `${edge.source}:${edge.target}`;
      edges.push({
        id: key,
        source: edge.source,
        target: edge.target,
        status: oldEdgeKeys.has(key) ? "unchanged" : "added"
      });
    });

    (oldGraph?.edges || []).forEach(edge => {
      const key = `${edge.source}:${edge.target}`;
      if (!newEdgeKeys.has(key)) {
        edges.push({
          id: key,
          source: edge.source,
          target: edge.target,
          status: "removed"
        });
      }
    });

    return { positions, edges, nodeWidth, nodeHeight };
  }, [newGraph, oldGraph, width]);

  // Node status map
  const nodeStatusMap = useMemo(() => {
    const map: Record<string, "added" | "removed" | "modified" | "unchanged"> = {};

    diff.addedNodes.forEach(node => {
      map[node.id] = "added";
    });

    diff.removedNodes.forEach(node => {
      map[node.id] = "removed";
    });

    diff.modifiedNodes.forEach(nodeChange => {
      map[nodeChange.nodeId] = "modified";
    });

    const oldNodeIds = new Set(oldGraph?.nodes?.map(n => n.id) || []);

    [...(newGraph?.nodes || [])].forEach(node => {
      if (!map[node.id] && oldNodeIds.has(node.id)) {
        map[node.id] = "unchanged";
      }
    });

    return map;
  }, [diff, oldGraph, newGraph]);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 0.2, 2));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 0.2, 0.5));
  }, []);

  const handleCenter = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleNodeClick = useCallback((nodeId: string, status: "added" | "removed" | "modified" | "unchanged") => {
    setSelectedNodeId(prev => prev === nodeId ? null : nodeId);
    onNodeSelect?.(nodeId, status);
  }, [onNodeSelect]);

  const hasChanges = diff.hasChanges ||
    diff.addedNodes.length > 0 ||
    diff.removedNodes.length > 0 ||
    diff.modifiedNodes.length > 0 ||
    diff.addedEdges.length > 0 ||
    diff.removedEdges.length > 0;

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return (newGraph?.nodes || oldGraph?.nodes || []).find(n => n.id === selectedNodeId);
  }, [selectedNodeId, newGraph, oldGraph]);

  const selectedStatus = selectedNodeId ? nodeStatusMap[selectedNodeId] : null;

  if (!hasChanges) {
    return (
      <Paper
        sx={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: theme.palette.action.hover,
        }}
      >
        <Typography variant="caption" color="text.secondary">
          No changes to display
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      sx={{
        width,
        height,
        bgcolor: theme.palette.action.hover,
        overflow: "hidden",
        position: "relative",
        display: "flex",
        flexDirection: "column"
      }}
    >
      {/* Toolbar */}
      <Box
        sx={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 10,
          display: "flex",
          gap: 0.5,
          bgcolor: "background.paper",
          borderRadius: 1,
          padding: 0.5,
          boxShadow: 1
        }}
      >
        <Tooltip title="Zoom in">
          <IconButton size="small" onClick={handleZoomIn}>
            <ZoomInIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Zoom out">
          <IconButton size="small" onClick={handleZoomOut}>
            <ZoomOutIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Center">
          <IconButton size="small" onClick={handleCenter}>
            <CenterIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Selected node info */}
      <Fade in={!!selectedNode}>
        <Box
          sx={{
            position: "absolute",
            bottom: 8,
            left: 8,
            right: 8,
            zIndex: 10,
            bgcolor: "background.paper",
            borderRadius: 1,
            padding: 1,
            boxShadow: 2,
            display: "flex",
            alignItems: "center",
            gap: 1
          }}
        >
          <InfoIcon fontSize="small" color="action" />
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" fontWeight="bold">
              {selectedNode?.type?.split(".").pop() || selectedNodeId}
            </Typography>
            {selectedStatus && (
              <Chip
                label={selectedStatus}
                size="small"
                sx={{
                  ml: 1,
                  height: 18,
                  fontSize: "0.65rem",
                  bgcolor: selectedStatus === "added"
                    ? `${theme.palette.success.main}20`
                    : selectedStatus === "removed"
                    ? `${theme.palette.error.main}20`
                    : selectedStatus === "modified"
                    ? `${theme.palette.warning.main}20`
                    : undefined,
                  color: selectedStatus === "added"
                    ? theme.palette.success.main
                    : selectedStatus === "removed"
                    ? theme.palette.error.main
                    : selectedStatus === "modified"
                    ? theme.palette.warning.main
                    : undefined
                }}
              />
            )}
          </Box>
          <Typography variant="caption" color="text.secondary">
            ID: {selectedNodeId?.slice(0, 8)}...
          </Typography>
        </Box>
      </Fade>

      {/* Main SVG */}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ display: "block" }}
      >
        <defs>
          {["added", "removed", "unchanged"].map(status => (
            <marker
              key={`arrowhead-${status}`}
              id={`arrowhead-${status}`}
              markerWidth="6"
              markerHeight="4"
              refX="5"
              refY="2"
              orient="auto"
            >
              <polygon
                points="0 0, 6 2, 0 4"
                fill={status === "added"
                  ? theme.palette.success.main
                  : status === "removed"
                  ? theme.palette.error.main
                  : theme.palette.text.disabled}
              />
            </marker>
          ))}
        </defs>

        <g transform={`translate(${width / 2 + pan.x}, ${height / 2 + pan.y}) scale(${zoom})`}>
          {/* Edges */}
          {layout.edges.map(edge => {
            const sourcePos = layout.positions[edge.source];
            const targetPos = layout.positions[edge.target];
            if (!sourcePos || !targetPos) return null;

            const isHighlighted = selectedNodeId
              ? edge.source === selectedNodeId || edge.target === selectedNodeId
              : false;

            return (
              <InteractiveMiniEdge
                key={edge.id}
                x1={sourcePos.x}
                y1={sourcePos.y}
                x2={targetPos.x}
                y2={targetPos.y}
                status={edge.status}
                isHighlighted={isHighlighted}
              />
            );
          })}

          {/* Nodes */}
          {(newGraph?.nodes || oldGraph?.nodes || []).map(node => {
            const pos = layout.positions[node.id];
            const status = nodeStatusMap[node.id] || "unchanged";
            if (!pos) return null;

            return (
              <InteractiveMiniNode
                key={node.id}
                node={node}
                x={pos.x - layout.nodeWidth / 2}
                y={pos.y - layout.nodeHeight / 2}
                status={status}
                width={layout.nodeWidth}
                height={layout.nodeHeight}
                isSelected={selectedNodeId === node.id}
                onClick={() => handleNodeClick(node.id, status)}
                onHover={(isHovered) => setHoveredNodeId(isHovered ? node.id : null)}
              />
            );
          })}
        </g>
      </svg>

      {/* Legend */}
      <Box
        sx={{
          position: "absolute",
          bottom: 8,
          right: 8,
          display: "flex",
          gap: 0.5,
          flexWrap: "wrap",
          maxWidth: width / 2
        }}
      >
        {diff.addedNodes.length > 0 && (
          <Chip
            icon={<Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: theme.palette.success.main }} />}
            label={`+${diff.addedNodes.length}`}
            size="small"
            sx={{ height: 20, fontSize: "0.65rem" }}
          />
        )}
        {diff.removedNodes.length > 0 && (
          <Chip
            icon={<Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: theme.palette.error.main }} />}
            label={`-${diff.removedNodes.length}`}
            size="small"
            sx={{ height: 20, fontSize: "0.65rem" }}
          />
        )}
        {diff.modifiedNodes.length > 0 && (
          <Chip
            icon={<Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: theme.palette.warning.main }} />}
            label={`~${diff.modifiedNodes.length}`}
            size="small"
            sx={{ height: 20, fontSize: "0.65rem" }}
          />
        )}
      </Box>
    </Paper>
  );
};

export default InteractiveGraphVisualDiff;

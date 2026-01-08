/**
 * Workflow Mini Preview Component
 *
 * Displays a compact visual representation of a workflow graph.
 * Used in version history to show what a workflow looked like at a glance.
 */

import React, { useMemo } from "react";
import { Box, Typography, Paper, Tooltip } from "@mui/material";
import { WorkflowVersion, Graph, Node as NodeType } from "../../stores/ApiTypes";

interface WorkflowMiniPreviewProps {
  version: WorkflowVersion & { save_type?: string; size_bytes?: number };
  width?: number;
  height?: number;
}

interface PreviewNode {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const NODE_WIDTH = 60;
const NODE_HEIGHT = 24;
const PADDING = 10;
const MIN_X = 20;
const MIN_Y = 20;

const getNodeColor = (nodeType: string): string => {
  if (nodeType.includes("input")) {return "#4caf50";}
  if (nodeType.includes("output")) {return "#2196f3";}
  if (nodeType.includes("llm") || nodeType.includes("model")) {return "#ff9800";}
  if (nodeType.includes("image")) {return "#9c27b0";}
  if (nodeType.includes("text")) {return "#00bcd4";}
  if (nodeType.includes("audio")) {return "#e91e63";}
  if (nodeType.includes("condition") || nodeType.includes("if")) {return "#f44336";}
  if (nodeType.includes("group")) {return "#607d8b";}
  return "#9e9e9e";
};

const extractNodeName = (nodeType: string): string => {
  const parts = nodeType.split(".");
  const lastPart = parts[parts.length - 1];
  return lastPart
    .replace(/([A-Z])/g, " $1")
    .trim()
    .substring(0, 8)
    .toLowerCase();
};

const calculateNodePositions = (graph: Graph): PreviewNode[] => {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];

  if (nodes.length === 0) {return [];}

  const nodeMap = new Map<string, PreviewNode>();
  const visited = new Set<string>();
  const queue: string[] = [];
  const positions = new Map<string, { x: number; y: number }>();

  const startNodes = nodes.filter((n) => !edges.some((e) => e.target === n.id));
  startNodes.forEach((node, index) => {
    positions.set(node.id, { x: MIN_X, y: MIN_Y + index * (NODE_HEIGHT + PADDING) });
    queue.push(node.id);
  });

  const xOffset = NODE_WIDTH + PADDING * 2;
  const yOffset = NODE_HEIGHT + PADDING;

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) {continue;}
    visited.add(currentId);

    const currentPos = positions.get(currentId);
    if (!currentPos) {continue;}

    const outgoingEdges = edges.filter((e) => e.source === currentId);

    outgoingEdges.forEach((edge, index) => {
      if (!positions.has(edge.target)) {
        const targetIndex = edges.filter((e) => e.source === edge.target).length;
        positions.set(edge.target, {
          x: currentPos.x + xOffset,
          y: Math.max(MIN_Y, currentPos.y - (outgoingEdges.length - 1) * yOffset / 2 + index * yOffset)
        });
      }
      if (!visited.has(edge.target)) {
        queue.push(edge.target);
      }
    });
  }

  nodes.forEach((node) => {
    const pos = positions.get(node.id) || { x: MIN_X, y: MIN_Y };
    nodeMap.set(node.id, {
      id: node.id,
      type: node.type,
      x: pos.x,
      y: pos.y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT
    });
  });

  return Array.from(nodeMap.values());
};

export const WorkflowMiniPreview: React.FC<WorkflowMiniPreviewProps> = ({
  version,
  width = 200,
  height = 120
}) => {
  const graph = useMemo(() => {
    try {
      return version.graph as Graph || { nodes: [], edges: [] };
    } catch {
      return { nodes: [], edges: [] };
    }
  }, [version]);

  const previewNodes = useMemo(() => calculateNodePositions(graph), [graph]);

  const nodeCount = graph.nodes?.length || 0;
  const edgeCount = graph.edges?.length || 0;

  if (nodeCount === 0) {
    return (
      <Paper
        elevation={0}
        sx={{
          width,
          height,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "action.hover",
          border: 1,
          borderColor: "divider",
          borderRadius: 1
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Empty workflow
        </Typography>
      </Paper>
    );
  }

  const scale = Math.min(
    width / (Math.max(...previewNodes.map((n) => n.x)) + NODE_WIDTH + PADDING * 2 || width),
    height / (Math.max(...previewNodes.map((n) => n.y)) + NODE_HEIGHT + PADDING * 2 || height),
    1
  );

  const offsetX = (width - (Math.max(...previewNodes.map((n) => n.x)) + NODE_WIDTH) * scale) / 2;
  const offsetY = (height - (Math.max(...previewNodes.map((n) => n.y)) + NODE_HEIGHT) * scale) / 2;

  return (
    <Tooltip
      title={
        <Box>
          <Typography variant="caption" fontWeight="medium">
            {version.name || `v${version.version}`}
          </Typography>
          <Typography variant="caption" display="block" color="text.secondary">
            {nodeCount} node{nodeCount !== 1 ? "s" : ""}, {edgeCount} connection{edgeCount !== 1 ? "s" : ""}
          </Typography>
        </Box>
      }
      arrow
      placement="top"
    >
      <Paper
        elevation={0}
        sx={{
          width,
          height,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "action.hover",
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          overflow: "hidden",
          position: "relative"
        }}
      >
        <svg width={width} height={height} style={{ position: "absolute", top: 0, left: 0 }}>
          {previewNodes.map((node) => {
            const color = getNodeColor(node.type);
            return (
              <g key={node.id} transform={`translate(${offsetX + node.x * scale}, ${offsetY + node.y * scale})`}>
                <rect
                  width={NODE_WIDTH * scale}
                  height={NODE_HEIGHT * scale}
                  rx={3 * scale}
                  fill={color}
                  opacity={0.8}
                />
                <text
                  x={(NODE_WIDTH * scale) / 2}
                  y={(NODE_HEIGHT * scale) / 2 + 4 * scale}
                  textAnchor="middle"
                  fill="white"
                  fontSize={10 * scale}
                  fontFamily="sans-serif"
                >
                  {extractNodeName(node.type)}
                </text>
              </g>
            );
          })}
        </svg>
        <Box
          sx={{
            position: "absolute",
            bottom: 4,
            right: 4,
            bgcolor: "rgba(0,0,0,0.6)",
            borderRadius: 0.5,
            px: 0.5,
            py: 0.25
          }}
        >
          <Typography variant="caption" sx={{ color: "white", fontSize: "0.6rem" }}>
            {nodeCount}
          </Typography>
        </Box>
      </Paper>
    </Tooltip>
  );
};

export default WorkflowMiniPreview;

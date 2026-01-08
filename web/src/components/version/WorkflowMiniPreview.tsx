/**
 * Workflow Mini Preview Component
 *
 * Displays a compact visual representation of a workflow graph.
 * Used in version history to show what a workflow looked like at a glance,
 * and in the workflow list sidebar to show workflow structure.
 */

import React, { useMemo } from "react";
import { Box, Typography, Paper, Tooltip } from "@mui/material";
import { Graph } from "../../stores/ApiTypes";

// Data structure that has graph - can be WorkflowVersion or Workflow
interface WorkflowWithGraph {
  graph?: Graph | null;
  name?: string;
  version?: number;
}

interface WorkflowMiniPreviewProps {
  /** WorkflowVersion or Workflow with graph data */
  workflow: WorkflowWithGraph;
  width?: number | string;
  height?: number | string;
  /** Optional label to show in tooltip (defaults to workflow name or version) */
  label?: string;
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
  if (nodeType.includes("input")) return "#4caf50";
  if (nodeType.includes("output")) return "#2196f3";
  if (nodeType.includes("llm") || nodeType.includes("model")) return "#ff9800";
  if (nodeType.includes("image")) return "#9c27b0";
  if (nodeType.includes("text")) return "#00bcd4";
  if (nodeType.includes("audio")) return "#e91e63";
  if (nodeType.includes("condition") || nodeType.includes("if")) return "#f44336";
  if (nodeType.includes("group")) return "#607d8b";
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

  if (nodes.length === 0) return [];

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
    if (!currentId || visited.has(currentId)) continue;
    visited.add(currentId);

    const currentPos = positions.get(currentId);
    if (!currentPos) continue;

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
  workflow,
  width = 200,
  height = 120,
  label
}) => {
  const graph = useMemo(() => {
    try {
      return (workflow.graph as Graph) || { nodes: [], edges: [] };
    } catch {
      return { nodes: [], edges: [] };
    }
  }, [workflow]);

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

  // Calculate bounding box
  const maxX = Math.max(...previewNodes.map((n) => n.x + n.width), 0) + PADDING;
  const maxY = Math.max(...previewNodes.map((n) => n.y + n.height), 0) + PADDING;

  // Use a slight padding for the viewBox to ensure nothing is cut off
  // We double padding for symmetry if we assume 0,0 start, but layout ensures min is MIN_X/MIN_Y
  const viewBoxWidth = maxX + PADDING;
  const viewBoxHeight = maxY + PADDING;

  return (
    <Tooltip
      title={
        <Box>
          <Typography variant="caption" fontWeight="medium">
            {label ||
              workflow.name ||
              (workflow.version ? `v${workflow.version}` : "Workflow")}
          </Typography>
          <Typography variant="caption" display="block" color="text.secondary">
            {nodeCount} node{nodeCount !== 1 ? "s" : ""}, {edgeCount} connection
            {edgeCount !== 1 ? "s" : ""}
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
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ display: "block" }}
        >
          {previewNodes.map((node) => {
            const color = getNodeColor(node.type);
            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
              >
                <rect
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={3}
                  fill={color}
                  opacity={0.8}
                />
                <text
                  x={NODE_WIDTH / 2}
                  y={NODE_HEIGHT / 2 + 4}
                  textAnchor="middle"
                  fill="white"
                  fontSize={10}
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
            py: 0.25,
            pointerEvents: "none"
          }}
        >
          <Typography
            variant="caption"
            sx={{ color: "white", fontSize: "0.6rem" }}
          >
            {nodeCount}
          </Typography>
        </Box>
      </Paper>
    </Tooltip>
  );
};

export default WorkflowMiniPreview;

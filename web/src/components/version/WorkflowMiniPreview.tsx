/**
 * Workflow Mini Preview Component
 *
 * Displays a compact visual representation of a workflow graph.
 * Used in version history to show what a workflow looked like at a glance,
 * and in the workflow list sidebar to show workflow structure.
 */

import React, { useMemo } from "react";
import { Box, Typography, Paper } from "@mui/material";
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

interface PreviewEdge {
  id: string;
  source: string;
  target: string;
}

const NODE_WIDTH = 60;
const NODE_HEIGHT = 24;
const PADDING = 10;
const MIN_X = 20;
const MIN_Y = 20;
const EDGE_CONTROL_POINT_OFFSET = 30; // Maximum offset for bezier curve control points

/**
 * NodeColors palette for mini preview - aligned with SpectraNode from data_types.tsx
 * Note: We maintain a local copy because SpectraNode is not exported from data_types.tsx
 * and the preview needs fewer, simplified categories for visual clarity at small sizes.
 */
const NodeColors = {
  input: "#10B981",       // emerald 500 - input nodes (aligns with SpectraNode.boolean)
  output: "#3B82F6",      // blue 500 - output nodes (aligns with SpectraNode.reference)
  llm: "#8B5CF6",         // violet 500 - LLM/language models
  model: "#A78BFA",       // violet 400 - other models
  image: "#D946EF",       // fuchsia 500 - image processing (aligns with SpectraNode.texture)
  text: "#F59E0B",        // amber 500 - text processing (aligns with SpectraNode.textual)
  audio: "#0EA5E9",       // sky 500 - audio processing (aligns with SpectraNode.audio)
  video: "#8B5CF6",       // violet 500 - video processing (aligns with SpectraNode.video)
  condition: "#F43F5E",   // rose 500 - conditions/flow control (aligns with SpectraNode.event)
  loop: "#2563EB",        // blue 600 - loops
  group: "#64748B",       // slate 500 - groups (aligns with SpectraNode.execution)
  math: "#22D3EE",        // cyan 400 - math/numbers (aligns with SpectraNode.scalar)
  data: "#FACC15",        // yellow 400 - data transformation (aligns with SpectraNode.collection)
  agent: "#EC4899",       // pink 500 - agents
  default: "#6B7280"      // gray 500 - fallback
} as const;

const getNodeColor = (nodeType: string): string => {
  const type = nodeType.toLowerCase();
  if (type.includes("input") || type.includes("chatinput")) { return NodeColors.input; }
  if (type.includes("output") || type.includes("chatoutput") || type.includes("preview")) { return NodeColors.output; }
  if (type.includes("llm") || type.includes("chatgpt") || type.includes("claude") || type.includes("ollama") || type.includes("openai")) { return NodeColors.llm; }
  if (type.includes("model") || type.includes("comfy")) { return NodeColors.model; }
  if (type.includes("image") || type.includes("diffusion") || type.includes("stable")) { return NodeColors.image; }
  if (type.includes("text") || type.includes("string") || type.includes("prompt")) { return NodeColors.text; }
  if (type.includes("audio") || type.includes("speech") || type.includes("tts")) { return NodeColors.audio; }
  if (type.includes("video")) { return NodeColors.video; }
  if (type.includes("condition") || type.includes("if") || type.includes("switch") || type.includes("branch")) { return NodeColors.condition; }
  if (type.includes("loop") || type.includes("for") || type.includes("while") || type.includes("repeat")) { return NodeColors.loop; }
  if (type.includes("group")) { return NodeColors.group; }
  if (type.includes("math") || type.includes("number") || type.includes("float") || type.includes("int")) { return NodeColors.math; }
  if (type.includes("list") || type.includes("dict") || type.includes("array") || type.includes("dataframe")) { return NodeColors.data; }
  if (type.includes("agent") || type.includes("task")) { return NodeColors.agent; }
  return NodeColors.default;
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

interface CalculatedGraph {
  nodes: PreviewNode[];
  edges: PreviewEdge[];
}

const calculateNodePositions = (graph: Graph): CalculatedGraph => {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];

  if (nodes.length === 0) { return { nodes: [], edges: [] }; }

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
    if (!currentId || visited.has(currentId)) { continue; }
    visited.add(currentId);

    const currentPos = positions.get(currentId);
    if (!currentPos) { continue; }

    const outgoingEdges = edges.filter((e) => e.source === currentId);

    outgoingEdges.forEach((edge, index) => {
      if (!positions.has(edge.target)) {
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

  // Process edges - only include edges where both source and target nodes exist
  // Use index to ensure unique keys when multiple edges connect the same nodes
  const previewEdges: PreviewEdge[] = edges
    .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
    .map((e, index) => ({
      id: e.id || `${e.source}-${e.target}-${index}`,
      source: e.source,
      target: e.target
    }));

  return {
    nodes: Array.from(nodeMap.values()),
    edges: previewEdges
  };
};

export const WorkflowMiniPreview: React.FC<WorkflowMiniPreviewProps> = ({
  workflow,
  width = 200,
  height = 120
}) => {
  const graph = useMemo(() => {
    try {
      return (workflow.graph as Graph) || { nodes: [], edges: [] };
    } catch {
      return { nodes: [], edges: [] };
    }
  }, [workflow]);

  const { nodes: previewNodes, edges: previewEdges } = useMemo(
    () => calculateNodePositions(graph),
    [graph]
  );

  // Create a map for quick node lookup when drawing edges
  const nodeMap = useMemo(() => {
    const map = new Map<string, PreviewNode>();
    previewNodes.forEach((node) => map.set(node.id, node));
    return map;
  }, [previewNodes]);

  const nodeCount = graph.nodes?.length || 0;
  const _edgeCount = graph.edges?.length || 0;

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
          background: "linear-gradient(135deg, rgba(30,30,30,0.95) 0%, rgba(45,45,45,0.9) 100%)",
          border: "1px solid",
          borderColor: "rgba(255,255,255,0.08)",
          borderRadius: 2,
          transition: "all 0.2s ease-in-out",
          "&:hover": {
            borderColor: "rgba(255,255,255,0.15)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
          }
        }}
      >
        <Typography
          variant="caption"
          sx={{
            color: "rgba(255,255,255,0.4)",
            fontFamily: "var(--fontFamily2)",
            textAlign: "center",
            fontSize: "var(--fontSizeTiny)",
            lineHeight: "1.2",
            textTransform: "uppercase",
            letterSpacing: "0.1em"
          }}
        >
          Empty workflow
        </Typography>
      </Paper>
    );
  }

  // Calculate bounding box
  const maxX = Math.max(...previewNodes.map((n) => n.x + n.width), 0) + PADDING;
  const maxY = Math.max(...previewNodes.map((n) => n.y + n.height), 0) + PADDING;

  // Use a slight padding for the viewBox to ensure nothing is cut off
  const viewBoxWidth = maxX + PADDING;
  const viewBoxHeight = maxY + PADDING;

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
        background: "linear-gradient(135deg, rgba(20,22,28,0.98) 0%, rgba(35,37,42,0.95) 100%)",
        border: "1px solid",
        borderColor: "rgba(255,255,255,0.08)",
        borderRadius: 2,
        overflow: "hidden",
        position: "relative",
        transition: "all 0.2s ease-in-out",
        "&:hover": {
          borderColor: "rgba(96,165,250,0.3)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(96,165,250,0.1)"
        }
      }}
    >
      {/* Subtle gradient overlay */}
      <Box
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "radial-gradient(ellipse at 30% 20%, rgba(96,165,250,0.03) 0%, transparent 50%)",
          pointerEvents: "none"
        }}
      />
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block", position: "relative", zIndex: 1 }}
      >
        {/* Define gradients for edges */}
        <defs>
          <linearGradient id="edgeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.3)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.1)" />
          </linearGradient>
        </defs>

        {/* Render edges first (behind nodes) */}
        {previewEdges.map((edge) => {
          const sourceNode = nodeMap.get(edge.source);
          const targetNode = nodeMap.get(edge.target);
          if (!sourceNode || !targetNode) { return null; }

          // Calculate edge path - from right side of source to left side of target
          const startX = sourceNode.x + sourceNode.width;
          const startY = sourceNode.y + sourceNode.height / 2;
          const endX = targetNode.x;
          const endY = targetNode.y + targetNode.height / 2;

          // Create a smooth bezier curve
          const controlPointOffset = Math.min(EDGE_CONTROL_POINT_OFFSET, Math.abs(endX - startX) / 2);
          const path = `M ${startX} ${startY} C ${startX + controlPointOffset} ${startY}, ${endX - controlPointOffset} ${endY}, ${endX} ${endY}`;

          return (
            <path
              key={edge.id}
              d={path}
              fill="none"
              stroke="url(#edgeGradient)"
              strokeWidth={1.5}
              strokeLinecap="round"
              opacity={0.6}
            />
          );
        })}

        {/* Render nodes */}
        {previewNodes.map((node) => {
          const color = getNodeColor(node.type);
          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
            >
              {/* Node shadow */}
              <rect
                x={1}
                y={2}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={4}
                fill="rgba(0,0,0,0.3)"
              />
              {/* Node background with gradient */}
              <rect
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={4}
                fill={color}
                opacity={0.9}
              />
              {/* Subtle highlight at top */}
              <rect
                width={NODE_WIDTH}
                height={NODE_HEIGHT / 3}
                rx={4}
                fill="rgba(255,255,255,0.15)"
              />
              {/* Node text */}
              <text
                x={NODE_WIDTH / 2}
                y={NODE_HEIGHT / 2 + 3}
                textAnchor="middle"
                fill="white"
                fontSize={9}
                fontFamily="Inter, sans-serif"
                fontWeight={500}
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
              >
                {extractNodeName(node.type)}
              </text>
            </g>
          );
        })}
      </svg>
    </Paper>
  );
};

export default WorkflowMiniPreview;

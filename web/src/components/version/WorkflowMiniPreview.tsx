/**
 * Workflow Mini Preview Component
 *
 * Displays a compact schematic of a workflow graph — a node-editor "minimap".
 * Used in version history to show what a workflow looked like at a glance,
 * and in the workflow list sidebar to show workflow structure.
 *
 * The layout is a left-to-right layered flow (longest-path layering) so nodes
 * never overlap and the data flow reads at a glance, even for large graphs.
 * Nodes are flat colour-coded chips (no per-node text, which is illegible once
 * the SVG scales down); identity comes from the row label and tooltip instead.
 */

import React, { useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import { Caption, FlexColumn, Surface, MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
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

const NODE_WIDTH = 26;
const NODE_HEIGHT = 11;
const NODE_RADIUS = 3;
const X_GAP = 22;
const Y_GAP = 9;
const PADDING = 12;
const GRID_SIZE = 12;
const EDGE_CONTROL_POINT_OFFSET = 18; // Maximum offset for bezier curve control points

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
  if (type.includes("model")) { return NodeColors.model; }
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

interface CalculatedGraph {
  nodes: PreviewNode[];
  edges: PreviewEdge[];
}

/**
 * Layered left-to-right layout. Each node's column is its longest path from a
 * source node, so edges flow forward and nodes in the same column stack
 * vertically without overlapping. Columns are centred so the schematic stays
 * balanced regardless of how lopsided the graph is.
 */
const calculateNodePositions = (graph: Graph): CalculatedGraph => {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];

  if (nodes.length === 0) { return { nodes: [], edges: [] }; }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const validEdges = edges.filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
  );

  const incoming = new Map<string, string[]>();
  for (const id of nodeIds) { incoming.set(id, []); }
  for (const e of validEdges) { incoming.get(e.target)?.push(e.source); }

  // Longest-path layering, memoised. The stack guard keeps cycles from
  // recursing forever (a back-edge just resolves to column 0).
  const layer = new Map<string, number>();
  const computeLayer = (id: string, stack: Set<string>): number => {
    const cached = layer.get(id);
    if (cached !== undefined) { return cached; }
    if (stack.has(id)) { return 0; }
    stack.add(id);
    let l = 0;
    for (const src of incoming.get(id) || []) {
      l = Math.max(l, computeLayer(src, stack) + 1);
    }
    stack.delete(id);
    layer.set(id, l);
    return l;
  };
  for (const node of nodes) { computeLayer(node.id, new Set()); }

  // Group nodes by column, preserving their original order within a column.
  const columns = new Map<number, string[]>();
  for (const node of nodes) {
    const l = layer.get(node.id) ?? 0;
    const col = columns.get(l);
    if (col) { col.push(node.id); } else { columns.set(l, [node.id]); }
  }

  let tallest = 0;
  for (const ids of columns.values()) { tallest = Math.max(tallest, ids.length); }

  const xStep = NODE_WIDTH + X_GAP;
  const yStep = NODE_HEIGHT + Y_GAP;
  const positions = new Map<string, { x: number; y: number }>();
  for (const [col, ids] of columns) {
    const centerOffset = ((tallest - ids.length) * yStep) / 2;
    ids.forEach((id, index) => {
      positions.set(id, {
        x: PADDING + col * xStep,
        y: PADDING + centerOffset + index * yStep
      });
    });
  }

  const previewNodes: PreviewNode[] = nodes.map((node) => {
    const pos = positions.get(node.id) || { x: PADDING, y: PADDING };
    return {
      id: node.id,
      type: node.type,
      x: pos.x,
      y: pos.y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT
    };
  });

  const previewEdges: PreviewEdge[] = validEdges.map((e, index) => ({
    id: e.id || `${e.source}-${e.target}-${index}`,
    source: e.source,
    target: e.target
  }));

  return { nodes: previewNodes, edges: previewEdges };
};

export const WorkflowMiniPreview: React.FC<WorkflowMiniPreviewProps> = ({
  workflow,
  width = 200,
  height = 120
}) => {
  const theme = useTheme();

  const graph = useMemo(() => {
    if (!workflow.graph) {
      return { nodes: [], edges: [] };
    }

    const graphObj = workflow.graph as Graph;
    return {
      nodes: graphObj.nodes || [],
      edges: graphObj.edges || []
    };
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

  const { viewBoxWidth, viewBoxHeight } = useMemo(() => {
    let mX = 0;
    let mY = 0;
    for (const n of previewNodes) {
      const right = n.x + n.width;
      const bottom = n.y + n.height;
      if (right > mX) mX = right;
      if (bottom > mY) mY = bottom;
    }
    return {
      viewBoxWidth: mX + PADDING,
      viewBoxHeight: mY + PADDING
    };
  }, [previewNodes]);

  const nodeCount = graph.nodes?.length || 0;

  if (nodeCount === 0) {
    return (
      <Surface
        sx={{
          width,
          height,
          backgroundColor: theme.vars.palette.background.paper,
          border: "1px solid",
          borderColor: theme.vars.palette.divider,
          borderRadius: BORDER_RADIUS.sm,
          transition: MOTION.all
        }}
      >
        <FlexColumn fullWidth fullHeight align="center" justify="center">
          <Caption
            sx={{
              color: theme.vars.palette.text.disabled,
              fontFamily: "var(--fontFamily2)",
              textAlign: "center",
              fontSize: "var(--fontSizeSmaller)",
              lineHeight: "1.2",
              textTransform: "uppercase",
              letterSpacing: "0.08em"
            }}
          >
            Empty workflow
          </Caption>
        </FlexColumn>
      </Surface>
    );
  }

  return (
    <Surface
      sx={{
        width,
        height,
        backgroundColor: theme.vars.palette.background.paper,
        border: "1px solid",
        borderColor: theme.vars.palette.divider,
        borderRadius: BORDER_RADIUS.sm,
        overflow: "hidden",
        position: "relative",
        transition: MOTION.all,
        "&:hover": {
          borderColor: theme.vars.palette.action.disabled
        }
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block" }}
      >
        <defs>
          {/* Faint dot grid — gives the schematic a node-editor minimap feel */}
          <pattern
            id="miniPreviewGrid"
            width={GRID_SIZE}
            height={GRID_SIZE}
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx={1}
              cy={1}
              r={0.6}
              fill={theme.vars.palette.text.primary}
              opacity={0.06}
            />
          </pattern>
        </defs>

        <rect
          x={0}
          y={0}
          width={viewBoxWidth}
          height={viewBoxHeight}
          fill="url(#miniPreviewGrid)"
        />

        {/* Render edges first (behind nodes) */}
        {previewEdges.map((edge) => {
          const sourceNode = nodeMap.get(edge.source);
          const targetNode = nodeMap.get(edge.target);
          if (!sourceNode || !targetNode) { return null; }

          // From the right side of the source to the left side of the target
          const startX = sourceNode.x + sourceNode.width;
          const startY = sourceNode.y + sourceNode.height / 2;
          const endX = targetNode.x;
          const endY = targetNode.y + targetNode.height / 2;

          const controlPointOffset = Math.max(
            6,
            Math.min(EDGE_CONTROL_POINT_OFFSET, Math.abs(endX - startX) / 2)
          );
          const path = `M ${startX} ${startY} C ${startX + controlPointOffset} ${startY}, ${endX - controlPointOffset} ${endY}, ${endX} ${endY}`;

          return (
            <path
              key={edge.id}
              d={path}
              fill="none"
              stroke={theme.vars.palette.text.secondary}
              strokeWidth={1}
              strokeLinecap="round"
              opacity={0.35}
            />
          );
        })}

        {/* Render nodes */}
        {previewNodes.map((node) => {
          const color = getNodeColor(node.type);
          return (
            <rect
              key={node.id}
              x={node.x}
              y={node.y}
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              rx={NODE_RADIUS}
              fill={color}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth={0.5}
            />
          );
        })}
      </svg>

      {/* Node count — gives a sense of scale for large graphs */}
      <Caption
        sx={{
          position: "absolute",
          bottom: 4,
          right: 6,
          color: theme.vars.palette.text.secondary,
          backgroundColor: `rgb(${theme.vars.palette.background.paperChannel} / 0.7)`,
          borderRadius: BORDER_RADIUS.xs,
          padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.sm)}`, // was 1px 5px
          fontFamily: "var(--fontFamily2)",
          fontSize: "var(--fontSizeSmaller)",
          lineHeight: 1.3,
          letterSpacing: "0.02em",
          pointerEvents: "none"
        }}
      >
        {nodeCount} {nodeCount === 1 ? "node" : "nodes"}
      </Caption>
    </Surface>
  );
};

export default React.memo(WorkflowMiniPreview);

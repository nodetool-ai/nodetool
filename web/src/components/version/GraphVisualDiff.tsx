/**
 * GraphVisualDiff Component
 *
 * Visualizes workflow graph differences as a mini node graph.
 * Shows nodes with color-coded indicators for added (green),
 * removed (red), and modified (orange) states.
 */

import React, { useMemo } from "react";
import { Box, Paper, Typography, Tooltip } from "@mui/material";
import { GraphDiff } from "../../utils/graphDiff";
import { Graph, Node } from "../../stores/ApiTypes";

interface GraphVisualDiffProps {
  diff: GraphDiff;
  oldGraph?: Graph | null;
  newGraph?: Graph | null;
  width?: number;
  height?: number;
}

interface MiniNodeProps {
  node: Node;
  x: number;
  y: number;
  status: "added" | "removed" | "modified" | "unchanged";
  width: number;
  height: number;
}

const MiniNode: React.FC<MiniNodeProps> = ({ node, x, y, status, width, height }) => {
  const colors = {
    added: { bg: "#4caf50", border: "#2e7d32", text: "#fff" },
    removed: { bg: "#f44336", border: "#c62828", text: "#fff" },
    modified: { bg: "#ff9800", border: "#ef6c00", text: "#fff" },
    unchanged: { bg: "#fff", border: "#ccc", text: "#333" }
  };

  const color = colors[status];

  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect
        width={width}
        height={height}
        rx={4}
        fill={color.bg}
        stroke={color.border}
        strokeWidth={status !== "unchanged" ? 2 : 1}
        opacity={status === "removed" ? 0.5 : 1}
      />
      <text
        x={width / 2}
        y={height / 2 + 4}
        textAnchor="middle"
        fill={color.text}
        fontSize={10}
        fontWeight={status !== "unchanged" ? "bold" : "normal"}
        style={{ pointerEvents: "none" }}
      >
        {node.type?.split(".").pop() || "Node"}
      </text>
      {status !== "unchanged" && (
        <circle
          cx={width}
          cy={0}
          r={4}
          fill={color.border}
        />
      )}
    </g>
  );
};

const MiniEdge: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  status: "added" | "removed" | "unchanged";
}> = ({ x1, y1, x2, y2, status }) => {
  const color = status === "added" ? "#4caf50" : status === "removed" ? "#f44336" : "#999";
  const strokeWidth = status !== "unchanged" ? 2 : 1;
  const opacity = status === "removed" ? 0.4 : 1;

  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={color}
      strokeWidth={strokeWidth}
      opacity={opacity}
      strokeDasharray={status === "removed" ? "4,2" : "none"}
    />
  );
};

export const GraphVisualDiff: React.FC<GraphVisualDiffProps> = ({
  diff,
  oldGraph,
  newGraph,
  width = 280,
  height = 180
}) => {
  const nodePositions = useMemo(() => {
    if (!newGraph?.nodes && !oldGraph?.nodes) {
      return {};
    }

    const positions: Record<string, { x: number; y: number }> = {};
    const nodeCount = Math.max(newGraph?.nodes?.length || 0, oldGraph?.nodes?.length || 0);
    const cols = Math.ceil(Math.sqrt(nodeCount));
    const nodeWidth = 60;
    const nodeHeight = 30;
    const gapX = 10;
    const gapY = 10;
    const startX = (width - cols * (nodeWidth + gapX)) / 2 + nodeWidth / 2;
    const startY = 30;

    const allNodes = [...(newGraph?.nodes || []), ...(oldGraph?.nodes || [])];
    const uniqueNodes = Array.from(new Map(allNodes.map(n => [n.id, n])).values());

    uniqueNodes.forEach((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      positions[node.id] = {
        x: startX + col * (nodeWidth + gapX),
        y: startY + row * (nodeHeight + gapY)
      };
    });

    return positions;
  }, [newGraph, oldGraph, width, height]);

  const allEdges = useMemo(() => {
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

    return edges;
  }, [newGraph, oldGraph]);

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
    const newNodeIds = new Set(newGraph?.nodes?.map(n => n.id) || []);

    [...(newGraph?.nodes || [])].forEach(node => {
      if (!map[node.id] && oldNodeIds.has(node.id)) {
        map[node.id] = "unchanged";
      }
    });

    return map;
  }, [diff, oldGraph, newGraph]);

  const nodeWidth = 60;
  const nodeHeight = 30;

  const hasAnyChanges = diff.hasChanges ||
    diff.addedNodes.length > 0 ||
    diff.removedNodes.length > 0 ||
    diff.modifiedNodes.length > 0 ||
    diff.addedEdges.length > 0 ||
    diff.removedEdges.length > 0;

  if (!hasAnyChanges) {
    return (
      <Paper
        sx={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "grey.50"
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
        bgcolor: "grey.50",
        overflow: "hidden",
        position: "relative"
      }}
    >
      <svg width={width} height={height} style={{ display: "block" }}>
        <defs>
          <marker
            id="arrowhead-added"
            markerWidth="6"
            markerHeight="4"
            refX="5"
            refY="2"
            orient="auto"
          >
            <polygon points="0 0, 6 2, 0 4" fill="#4caf50" />
          </marker>
          <marker
            id="arrowhead-removed"
            markerWidth="6"
            markerHeight="4"
            refX="5"
            refY="2"
            orient="auto"
          >
            <polygon points="0 0, 6 2, 0 4" fill="#f44336" />
          </marker>
          <marker
            id="arrowhead-unchanged"
            markerWidth="6"
            markerHeight="4"
            refX="5"
            refY="2"
            orient="auto"
          >
            <polygon points="0 0, 6 2, 0 4" fill="#999" />
          </marker>
        </defs>

        {allEdges.map(edge => {
          const sourcePos = nodePositions[edge.source];
          const targetPos = nodePositions[edge.target];
          if (!sourcePos || !targetPos) return null;

          return (
            <MiniEdge
              key={edge.id}
              x1={sourcePos.x + nodeWidth / 2}
              y1={sourcePos.y + nodeHeight / 2}
              x2={targetPos.x + nodeWidth / 2}
              y2={targetPos.y + nodeHeight / 2}
              status={edge.status}
            />
          );
        })}

        {(newGraph?.nodes || oldGraph?.nodes || []).map(node => {
          const pos = nodePositions[node.id];
          const status = nodeStatusMap[node.id] || "unchanged";
          if (!pos) return null;

          return (
            <Tooltip
              key={node.id}
              title={
                <Box>
                  <Typography variant="caption" fontWeight="bold">
                    {node.type?.split(".").pop() || "Node"}
                  </Typography>
                  <br />
                  <Typography variant="caption">
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </Typography>
                </Box>
              }
              arrow
            >
              <g>
                <MiniNode
                  node={node}
                  x={pos.x - nodeWidth / 2}
                  y={pos.y - nodeHeight / 2}
                  status={status}
                  width={nodeWidth}
                  height={nodeHeight}
                />
              </g>
            </Tooltip>
          );
        })}
      </svg>

      <Box
        sx={{
          position: "absolute",
          bottom: 4,
          right: 4,
          display: "flex",
          gap: 0.5
        }}
      >
        {diff.addedNodes.length > 0 && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#4caf50" }} />
            <Typography variant="caption" sx={{ fontSize: "0.6rem" }}>
              {diff.addedNodes.length}
            </Typography>
          </Box>
        )}
        {diff.removedNodes.length > 0 && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#f44336" }} />
            <Typography variant="caption" sx={{ fontSize: "0.6rem" }}>
              {diff.removedNodes.length}
            </Typography>
          </Box>
        )}
        {diff.modifiedNodes.length > 0 && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#ff9800" }} />
            <Typography variant="caption" sx={{ fontSize: "0.6rem" }}>
              {diff.modifiedNodes.length}
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
};

export default GraphVisualDiff;

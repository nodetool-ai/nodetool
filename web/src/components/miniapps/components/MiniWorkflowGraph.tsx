/** @jsxImportSource @emotion/react */
import React, { useMemo } from "react";
import { css, keyframes } from "@emotion/react";
import { Box, Typography, Tooltip } from "@mui/material";
import useStatusStore, { hashKey } from "../../../stores/StatusStore";
import { Workflow } from "../../../stores/ApiTypes";

interface MiniWorkflowGraphProps {
  workflow: Workflow;
  isRunning?: boolean;
}

interface SimpleNode {
  id: string;
  type: string;
  title: string;
}

interface SimpleEdge {
  source: string;
  target: string;
}

interface LayoutNode extends SimpleNode {
  x: number;
  y: number;
}

const glowPulse = keyframes`
  0%, 100% { 
    box-shadow: 0 0 4px rgba(76, 175, 80, 0.4), 0 0 8px rgba(76, 175, 80, 0.2);
    border-color: #4caf50;
  }
  50% { 
    box-shadow: 0 0 8px rgba(76, 175, 80, 0.8), 0 0 16px rgba(76, 175, 80, 0.4), 0 0 24px rgba(76, 175, 80, 0.2);
    border-color: #81c784;
  }
`;

const getNodeTitle = (node: any): string => {
  if (node.ui_properties?.title) {
    return node.ui_properties.title;
  }
  const typeParts = node.type.split(".");
  return typeParts[typeParts.length - 1];
};

const MiniWorkflowGraph: React.FC<MiniWorkflowGraphProps> = ({
  workflow,
  isRunning: _isRunning = false
}) => {
  const statuses = useStatusStore((state) => state.statuses);

  const containerWidth = 320;
  const containerHeight = 200;
  const nodeWidth = 80;
  const nodeHeight = 22;
  const paddingX = 16;
  const paddingY = 32;

  // Extract nodes/edges and compute automatic layout
  const { layoutNodes, edges } = useMemo(() => {
    if (!workflow?.graph?.nodes) {
      return { layoutNodes: [], edges: [] };
    }

    const graphNodes = workflow.graph.nodes;
    const graphEdges = workflow.graph.edges || [];

    // Filter out comment, group, and preview nodes
    const filteredNodes = graphNodes.filter(
      (n: any) =>
        !n.type.includes("Comment") &&
        !n.type.includes("Group") &&
        !n.type.includes("Preview")
    );

    const simpleNodes: SimpleNode[] = filteredNodes.map((node: any) => ({
      id: node.id,
      type: node.type,
      title: getNodeTitle(node)
    }));

    const simpleEdges: SimpleEdge[] = graphEdges.map((edge: any) => ({
      source: edge.source,
      target: edge.target
    }));

    // Build adjacency list and in-degree for topological sort
    const nodeMap = new Map(simpleNodes.map((n) => [n.id, n]));
    const inDegree = new Map<string, number>();
    const outEdges = new Map<string, string[]>();

    simpleNodes.forEach((node) => {
      inDegree.set(node.id, 0);
      outEdges.set(node.id, []);
    });

    simpleEdges.forEach((edge) => {
      if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
        inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
        outEdges.get(edge.source)?.push(edge.target);
      }
    });

    // Compute layers using BFS (Kahn's algorithm for topological ordering)
    const layers: string[][] = [];
    let currentLayer = simpleNodes
      .filter((n) => inDegree.get(n.id) === 0)
      .map((n) => n.id);

    while (currentLayer.length > 0) {
      layers.push(currentLayer);
      const nextLayer: string[] = [];
      
      currentLayer.forEach((nodeId) => {
        outEdges.get(nodeId)?.forEach((targetId) => {
          const newDegree = (inDegree.get(targetId) || 0) - 1;
          inDegree.set(targetId, newDegree);
          if (newDegree === 0) {
            nextLayer.push(targetId);
          }
        });
      });
      
      currentLayer = nextLayer;
    }

    // Handle any nodes not in layers (cycles or disconnected)
    const layeredNodeIds = new Set(layers.flat());
    const remainingNodes = simpleNodes
      .filter((n) => !layeredNodeIds.has(n.id))
      .map((n) => n.id);
    if (remainingNodes.length > 0) {
      layers.push(remainingNodes);
    }

    // Calculate positions based on layers (left to right)
    const numLayers = layers.length;
    const availableWidth = containerWidth - paddingX * 2 - nodeWidth;
    const availableHeight = containerHeight - paddingY - 12;

    const layoutNodes: LayoutNode[] = [];

    layers.forEach((layer, layerIndex) => {
      const x = numLayers === 1 
        ? availableWidth / 2 + paddingX
        : paddingX + (layerIndex / (numLayers - 1)) * availableWidth;
      
      const spacing = 12;
      const layerHeight = layer.length * nodeHeight + (layer.length - 1) * spacing;
      const startY = paddingY + (availableHeight - layerHeight) / 2;

      layer.forEach((nodeId, nodeIndex) => {
        const node = nodeMap.get(nodeId);
        if (node) {
          const y = startY + nodeIndex * (nodeHeight + spacing);
          layoutNodes.push({
            ...node,
            x,
            y
          });
        }
      });
    });

    return { layoutNodes, edges: simpleEdges };
  }, [workflow, containerHeight, containerWidth, nodeHeight, nodeWidth, paddingX, paddingY]);

  // Create nodeMap for edge rendering
  const nodeMap = useMemo(() => 
    new Map(layoutNodes.map((n) => [n.id, n])), 
    [layoutNodes]
  );

  const styles = css`
    .mini-graph-container {
      position: relative;
      width: ${containerWidth}px;
      height: ${containerHeight}px;
      background: var(--palette-background-paper);
      border-radius: 8px;
      border: 1px solid var(--palette-divider);
      overflow: hidden;
    }

    .mini-node {
      position: absolute;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      background: var(--palette-background-default);
      border: 1px solid var(--palette-divider);
      border-radius: 4px;
      font-size: 10px;
      white-space: nowrap;
      max-width: 90px;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: all 0.2s ease;
      cursor: default;
      
      &:hover {
        z-index: 10;
        max-width: none;
        background: var(--palette-action-hover);
      }
    }

    .mini-node.running {
      border-color: #4caf50;
      animation: ${glowPulse} 1.5s ease-in-out infinite;
    }

    .mini-node.completed {
      border-color: #4caf50;
      background: rgba(76, 175, 80, 0.15);
    }

    .mini-node.error {
      border-color: #f44336;
      background: rgba(244, 67, 54, 0.15);
    }

    .mini-node.booting,
    .mini-node.queued {
      border-color: #ff9800;
      background: rgba(255, 152, 0, 0.1);
    }

    .edge-line {
      stroke: var(--palette-divider);
      stroke-width: 1;
      fill: none;
    }
    
    .edge-line.active {
      stroke: #4caf50;
      stroke-width: 1.5;
    }

    .mini-graph-title {
      position: absolute;
      top: 6px;
      left: 10px;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--palette-text-secondary);
      font-weight: 500;
    }
  `;

  if (layoutNodes.length === 0) {
    return (
      <Box css={styles}>
        <div className="mini-graph-container">
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center", display: "block", pt: 8 }}>
            No nodes to display
          </Typography>
        </div>
      </Box>
    );
  }

  return (
    <Box css={styles}>
      <div className="mini-graph-container">
        <span className="mini-graph-title">Workflow Graph</span>
        
        {/* SVG for edges */}
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: containerWidth,
            height: containerHeight,
            pointerEvents: "none"
          }}
        >
          {edges.map((edge) => {
            const sourceNode = nodeMap.get(edge.source);
            const targetNode = nodeMap.get(edge.target);
            if (!sourceNode || !targetNode) {
              return null;
            }

            const sourceStatus = statuses[hashKey(workflow.id, edge.source)];
            const isActive = sourceStatus === "completed" || sourceStatus === "running";
            const edgeKey = `${edge.source}-${edge.target}`;

            // Draw a curved line from right side of source to left side of target
            const x1 = sourceNode.x + nodeWidth - 8;
            const y1 = sourceNode.y + nodeHeight / 2;
            const x2 = targetNode.x + 8;
            const y2 = targetNode.y + nodeHeight / 2;
            const midX = (x1 + x2) / 2;

            return (
              <path
                key={edgeKey}
                className={`edge-line ${isActive ? "active" : ""}`}
                d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
              />
            );
          })}
        </svg>

        {/* Nodes */}
        {layoutNodes.map((node) => {
          const status = statuses[hashKey(workflow.id, node.id)];
          const statusClass = status || "";

          return (
            <Tooltip key={node.id} title={`${node.title} (${node.type})`} placement="top" arrow>
              <div
                className={`mini-node ${statusClass}`}
                style={{
                  left: node.x,
                  top: node.y
                }}
              >
                <span>{node.title}</span>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </Box>
  );
};

export default MiniWorkflowGraph;

/** @jsxImportSource @emotion/react */
/**
 * NodeStack
 *
 * Renders a vertical list of nodes in a clip's bound workflow, ordered by
 * topological sort from inputs to the selected output node. Only nodes on
 * a path to the selected output are shown.
 *
 * For large graphs (> MAX_VISIBLE_NODES), intermediate nodes are collapsed
 * into an expander showing "(N more)" — only head and tail are always visible.
 *
 * Wires selection to SelectedClipNodeStore via the `onSelectNode` callback
 * (the parent GeneratedClipPanel owns the store interaction).
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

import type { Node, Edge } from "../../../stores/ApiTypes";
import useMetadataStore from "../../../stores/MetadataStore";
import {
  FlexColumn,
  Caption,
  EmptyState,
  ToolbarIconButton
} from "../../ui_primitives";
import { NodeStackRow } from "./NodeStackRow";

// ── Constants ─────────────────────────────────────────────────────────────

/** Max nodes shown before collapsing the middle section. PRD §28. */
const MAX_VISIBLE_NODES = 12;
/** Nodes kept visible at the start (input side) when collapsed. */
const HEAD_VISIBLE = 4;
/** Nodes kept visible at the end (output side) when collapsed. */
const TAIL_VISIBLE = 4;

// ── Styles ────────────────────────────────────────────────────────────────

const containerStyles = css({
  width: "100%"
});

const expanderRowStyles = (theme: Theme) =>
  css({
    padding: theme.spacing(0.25, 1),
    cursor: "pointer",
    userSelect: "none",
    "&:hover": {
      opacity: 0.8
    }
  });

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Collect all ancestor node IDs (inclusive of `terminalId`) that have a path
 * leading to `terminalId`, then return them in topological order (inputs first,
 * terminal last).
 */
function computeNodesOnPath(
  allNodes: Node[],
  allEdges: Edge[],
  terminalId: string
): Node[] {
  // Build reverse adjacency: target → [sources]
  const reverseAdj = new Map<string, string[]>();
  for (const n of allNodes) {
    reverseAdj.set(n.id, []);
  }
  for (const e of allEdges) {
    const arr = reverseAdj.get(e.target);
    if (arr) {
      arr.push(e.source);
    }
  }

  // BFS backwards from terminal to find all ancestors
  const reachable = new Set<string>([terminalId]);
  const queue: string[] = [terminalId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const parentId of reverseAdj.get(cur) ?? []) {
      if (!reachable.has(parentId)) {
        reachable.add(parentId);
        queue.push(parentId);
      }
    }
  }

  const reachableNodes = allNodes.filter((n) => reachable.has(n.id));
  const reachableEdges = allEdges.filter(
    (e) => reachable.has(e.source) && reachable.has(e.target)
  );

  // Kahn's topological sort (inputs → terminal)
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of reachableNodes) {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of reachableEdges) {
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    adj.get(e.source)?.push(e.target);
  }

  const topoQueue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      topoQueue.push(id);
    }
  }
  const sorted: string[] = [];
  while (topoQueue.length > 0) {
    const id = topoQueue.shift()!;
    sorted.push(id);
    for (const neighbor of adj.get(id) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) {
        topoQueue.push(neighbor);
      }
    }
  }

  const nodeById = new Map(reachableNodes.map((n) => [n.id, n]));
  return sorted
    .map((id) => nodeById.get(id))
    .filter((n): n is Node => n !== undefined);
}

/** Derive a display name for a node. */
function deriveNodeName(
  node: Node,
  metaTitle: string | undefined
): string {
  const data = node.data as Record<string, unknown> | undefined;
  const titleFromData = data?.title as string | undefined;
  if (titleFromData?.trim()) {
    return titleFromData.trim();
  }
  if (metaTitle?.trim()) {
    return metaTitle.trim();
  }
  // Fallback: last segment of the type string
  return node.type.split(".").pop() ?? node.type;
}

// ── Types ─────────────────────────────────────────────────────────────────

export interface NodeStackProps {
  /** All nodes from the workflow's graph. */
  nodes: Node[];
  /** All edges from the workflow's graph. */
  edges: Edge[];
  /** The terminal output node ID; path is computed relative to this node. */
  selectedOutputNodeId: string;
  /** The currently selected node ID (controlled by SelectedClipNodeStore). */
  selectedNodeId: string | null;
  /** The workflow ID (for StatusStore / ErrorStore keying). */
  workflowId: string;
  /** Called when the user clicks a node row. */
  onSelectNode: (nodeId: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────

export const NodeStack: React.FC<NodeStackProps> = memo(
  ({
    nodes,
    edges,
    selectedOutputNodeId,
    selectedNodeId,
    workflowId,
    onSelectNode
  }) => {
    const theme = useTheme();
    const metadata = useMetadataStore((s) => s.metadata);
    const [middleExpanded, setMiddleExpanded] = useState(false);

    const pathNodes = useMemo(
      () => computeNodesOnPath(nodes, edges, selectedOutputNodeId),
      [nodes, edges, selectedOutputNodeId]
    );

    const handleToggleMiddle = useCallback(() => {
      setMiddleExpanded((prev) => !prev);
    }, []);

    if (pathNodes.length === 0) {
      return (
        <EmptyState
          variant="empty"
          size="small"
          description="No nodes found on the path to the selected output."
        />
      );
    }

    // Collapse middle if too many nodes
    const needsCollapse =
      pathNodes.length > MAX_VISIBLE_NODES && !middleExpanded;
    const collapsedMiddleCount =
      pathNodes.length - HEAD_VISIBLE - TAIL_VISIBLE;
    const visibleNodes: Array<Node | "expander"> = needsCollapse
      ? [
          ...pathNodes.slice(0, HEAD_VISIBLE),
          "expander" as const,
          ...pathNodes.slice(pathNodes.length - TAIL_VISIBLE)
        ]
      : pathNodes;

    return (
      <FlexColumn css={containerStyles} gap={0}>
        {visibleNodes.map((item, renderIdx) => {
          if (item === "expander") {
            return (
              <FlexColumn
                key="expander"
                css={expanderRowStyles(theme)}
                align="center"
                gap={0.25}
                onClick={handleToggleMiddle}
              >
                <Caption color="secondary" sx={{ fontSize: 11 }}>
                  {collapsedMiddleCount} more node
                  {collapsedMiddleCount !== 1 ? "s" : ""}
                </Caption>
                <ToolbarIconButton
                  icon={<ExpandMoreIcon fontSize="small" />}
                  tooltip="Show all nodes"
                  onClick={handleToggleMiddle}
                  aria-label="Expand node list"
                  size="small"
                />
              </FlexColumn>
            );
          }

          // For collapsed view, compute true 1-based index in pathNodes
          let trueIndex: number;
          if (needsCollapse && renderIdx >= HEAD_VISIBLE) {
            // Items after the expander slot are from the tail
            const tailOffset = renderIdx - (HEAD_VISIBLE + 1);
            trueIndex = pathNodes.length - TAIL_VISIBLE + tailOffset + 1;
          } else {
            trueIndex = renderIdx + 1;
          }

          const nodeId = item.id;
          const meta = metadata[item.type];
          const nodeName = deriveNodeName(item, meta?.title);

          return (
            <NodeStackRow
              key={nodeId}
              nodeId={nodeId}
              nodeName={nodeName}
              workflowId={workflowId}
              index={trueIndex}
              isSelected={selectedNodeId === nodeId}
              onClick={() => onSelectNode(nodeId)}
            />
          );
        })}

        {pathNodes.length > MAX_VISIBLE_NODES && middleExpanded && (
          <FlexColumn
            css={expanderRowStyles(theme)}
            align="center"
            gap={0.25}
            onClick={handleToggleMiddle}
          >
            <Caption color="secondary" sx={{ fontSize: 11 }}>
              Collapse
            </Caption>
            <ToolbarIconButton
              icon={<ExpandLessIcon fontSize="small" />}
              tooltip="Collapse node list"
              onClick={handleToggleMiddle}
              aria-label="Collapse node list"
              size="small"
            />
          </FlexColumn>
        )}
      </FlexColumn>
    );
  }
);

NodeStack.displayName = "NodeStack";

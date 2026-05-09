/** @jsxImportSource @emotion/react */
/**
 * LayerNodeStack
 *
 * Vertical list of nodes in a generated layer's bound workflow, ordered by
 * topological sort from inputs to the selected output node. Only nodes on a
 * path to the selected output are shown.
 *
 * Mirrors the Timeline's `NodeStack`, retargeted from clips → layers. Reuses
 * `NodeStackRow` because it already reads from the global StatusStore /
 * ErrorStore by `(workflowId, nodeId)`.
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
import { NodeStackRow } from "../../timeline/Inspector/NodeStackRow";

// ── Constants ─────────────────────────────────────────────────────────────

const MAX_VISIBLE_NODES = 12;
const HEAD_VISIBLE = 4;
const TAIL_VISIBLE = 4;

// ── Styles ────────────────────────────────────────────────────────────────

const containerStyles = css({ width: "100%" });

const expanderRowStyles = (theme: Theme) =>
  css({
    padding: theme.spacing(0.25, 1),
    cursor: "pointer",
    userSelect: "none",
    "&:hover": { opacity: 0.8 }
  });

// ── Helpers ───────────────────────────────────────────────────────────────

function computeNodesOnPath(
  allNodes: Node[],
  allEdges: Edge[],
  terminalId: string
): Node[] {
  const dataEdges = allEdges.filter((e) => e.edge_type !== "control");

  const reverseAdj = new Map<string, string[]>();
  for (const n of allNodes) {
    reverseAdj.set(n.id, []);
  }
  for (const e of dataEdges) {
    reverseAdj.get(e.target)?.push(e.source);
  }

  const reachable = new Set<string>([terminalId]);
  const bfsQueue: string[] = [terminalId];
  let bfsHead = 0;
  while (bfsHead < bfsQueue.length) {
    const cur = bfsQueue[bfsHead++]!;
    for (const parentId of reverseAdj.get(cur) ?? []) {
      if (!reachable.has(parentId)) {
        reachable.add(parentId);
        bfsQueue.push(parentId);
      }
    }
  }

  const reachableNodes = allNodes.filter((n) => reachable.has(n.id));
  const reachableEdges = dataEdges.filter(
    (e) => reachable.has(e.source) && reachable.has(e.target)
  );

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
  let topoHead = 0;
  while (topoHead < topoQueue.length) {
    const id = topoQueue[topoHead++]!;
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

function pluralizeNode(count: number): string {
  return `${count} node${count !== 1 ? "s" : ""}`;
}

function deriveNodeName(node: Node, metaTitle: string | undefined): string {
  const data = node.data as Record<string, unknown> | undefined;
  const titleFromData = data?.title as string | undefined;
  if (titleFromData?.trim()) {
    return titleFromData.trim();
  }
  if (metaTitle?.trim()) {
    return metaTitle.trim();
  }
  return node.type.split(".").pop() ?? node.type;
}

// ── Types ─────────────────────────────────────────────────────────────────

export interface LayerNodeStackProps {
  nodes: Node[];
  edges: Edge[];
  selectedOutputNodeId: string;
  selectedNodeId: string | null;
  workflowId: string;
  onSelectNode: (nodeId: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────

export const LayerNodeStack: React.FC<LayerNodeStackProps> = memo(
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
              >
                <Caption color="secondary" sx={{ fontSize: 11 }}>
                  {pluralizeNode(collapsedMiddleCount)} more
                </Caption>
                <ToolbarIconButton
                  icon={<ExpandMoreIcon fontSize="small" />}
                  tooltip="Show all nodes"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleMiddle();
                  }}
                  aria-label="Expand node list"
                  size="small"
                />
              </FlexColumn>
            );
          }

          let absoluteIndex: number;
          if (needsCollapse && renderIdx >= HEAD_VISIBLE) {
            const tailOffset = renderIdx - (HEAD_VISIBLE + 1);
            absoluteIndex = pathNodes.length - TAIL_VISIBLE + tailOffset + 1;
          } else {
            absoluteIndex = renderIdx + 1;
          }

          const meta = metadata[item.type];
          const nodeName = deriveNodeName(item, meta?.title);

          return (
            <NodeStackRow
              key={item.id}
              nodeId={item.id}
              nodeName={nodeName}
              workflowId={workflowId}
              index={absoluteIndex}
              isSelected={selectedNodeId === item.id}
              onClick={() => onSelectNode(item.id)}
            />
          );
        })}

        {pathNodes.length > MAX_VISIBLE_NODES && middleExpanded && (
          <FlexColumn
            css={expanderRowStyles(theme)}
            align="center"
            gap={0.25}
          >
            <Caption color="secondary" sx={{ fontSize: 11 }}>
              Collapse
            </Caption>
            <ToolbarIconButton
              icon={<ExpandLessIcon fontSize="small" />}
              tooltip="Collapse node list"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleMiddle();
              }}
              aria-label="Collapse node list"
              size="small"
            />
          </FlexColumn>
        )}
      </FlexColumn>
    );
  }
);

LayerNodeStack.displayName = "LayerNodeStack";

/**
 * Draws lineage links: dotted lines between nodes that carry no value and
 * imply no execution order. Links live in `NodeStore.links`, not in React
 * Flow's edges, so they need no handles and no data-flow code ever sees them.
 * The layer sits in the viewport beneath edges and nodes.
 */
import React, { memo, useCallback } from "react";
import {
  Position,
  ViewportPortal,
  getBezierPath,
  useInternalNode,
  type InternalNode
} from "@xyflow/react";
import { useTheme } from "@mui/material/styles";
import { shallow } from "zustand/shallow";
import type { GraphLink } from "@nodetool-ai/protocol";
import { useNodeStoreRef, useNodes } from "../../contexts/NodeContext";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { TYPOGRAPHY } from "../ui_primitives";

const LAYER_STYLE: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  width: 1,
  height: 1,
  overflow: "visible",
  pointerEvents: "none",
  // Beneath edges and nodes, inside the viewport's stacking context.
  zIndex: -1
};

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const boxOf = (node: InternalNode | undefined): Box | null => {
  if (!node) {
    return null;
  }
  const width = node.measured?.width ?? node.width;
  const height = node.measured?.height ?? node.height;
  if (!width || !height) {
    return null;
  }
  const { x, y } = node.internals.positionAbsolute;
  return { x, y, width, height };
};

/** Anchor each end on the side of its node that faces the other node. */
export const linkAnchors = (
  source: Box,
  target: Box
): {
  sourceX: number;
  sourceY: number;
  sourcePosition: Position;
  targetX: number;
  targetY: number;
  targetPosition: Position;
} => {
  const sx = source.x + source.width / 2;
  const sy = source.y + source.height / 2;
  const tx = target.x + target.width / 2;
  const ty = target.y + target.height / 2;
  if (Math.abs(tx - sx) >= Math.abs(ty - sy)) {
    const forward = tx >= sx;
    return {
      sourceX: forward ? source.x + source.width : source.x,
      sourceY: sy,
      sourcePosition: forward ? Position.Right : Position.Left,
      targetX: forward ? target.x : target.x + target.width,
      targetY: ty,
      targetPosition: forward ? Position.Left : Position.Right
    };
  }
  const down = ty >= sy;
  return {
    sourceX: sx,
    sourceY: down ? source.y + source.height : source.y,
    sourcePosition: down ? Position.Bottom : Position.Top,
    targetX: tx,
    targetY: down ? target.y : target.y + target.height,
    targetPosition: down ? Position.Top : Position.Bottom
  };
};

interface LinkPathProps {
  link: GraphLink;
  selected: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onDelete: (id: string) => void;
}

const LinkPath: React.FC<LinkPathProps> = memo(
  ({ link, selected, onSelect, onDelete }) => {
    const theme = useTheme();
    const openContextMenu = useContextMenuStore(
      (state) => state.openContextMenu
    );
    const source = boxOf(useInternalNode(link.source));
    const target = boxOf(useInternalNode(link.target));

    const handleClick = useCallback(
      (event: React.MouseEvent) => {
        event.stopPropagation();
        onSelect(link.id, event.shiftKey || event.metaKey || event.ctrlKey);
      },
      [link.id, onSelect]
    );
    const handleAuxClick = useCallback(
      (event: React.MouseEvent) => {
        if (event.button !== 1) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onDelete(link.id);
      },
      [link.id, onDelete]
    );
    const handleContextMenu = useCallback(
      (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        openContextMenu(
          "edge-context-menu",
          link.id,
          event.clientX,
          event.clientY
        );
      },
      [link.id, openContextMenu]
    );
    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(link.id, false);
        } else if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          onDelete(link.id);
        }
      },
      [link.id, onDelete, onSelect]
    );

    if (!source || !target) {
      return null;
    }
    const [path, labelX, labelY] = getBezierPath(linkAnchors(source, target));
    const color = selected
      ? theme.vars.palette.primary.main
      : theme.vars.palette.text.secondary;
    const name = link.label
      ? `Link "${link.label}"`
      : "Lineage link";

    return (
      <g className="lineage-link" data-link-id={link.id}>
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={selected ? 3 : 2}
          strokeDasharray="1 6"
          strokeLinecap="round"
          strokeOpacity={selected ? 1 : 0.8}
        />
        {/* Wide transparent stroke so the dotted line is easy to hit. */}
        <path
          className="nopan nodrag"
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={16}
          style={{ pointerEvents: "stroke", cursor: "pointer" }}
          role="button"
          tabIndex={0}
          aria-label={name}
          aria-pressed={selected}
          onClick={handleClick}
          onAuxClick={handleAuxClick}
          onContextMenu={handleContextMenu}
          onKeyDown={handleKeyDown}
        />
        {link.label ? (
          <text
            x={labelX}
            y={labelY - 6}
            textAnchor="middle"
            fill={color}
            style={{
              fontSize: TYPOGRAPHY.sans.caption.fontSize,
              fontFamily: TYPOGRAPHY.sans.caption.fontFamily,
              pointerEvents: "none"
            }}
          >
            {link.label}
          </text>
        ) : null}
      </g>
    );
  }
);
LinkPath.displayName = "LinkPath";

const LinkLayer: React.FC = () => {
  const { links, selectedLinkIds, setLinkSelection, deleteEdge, setSelectedNodes } =
    useNodes(
      (state) => ({
        links: state.links,
        selectedLinkIds: state.selectedLinkIds,
        setLinkSelection: state.setLinkSelection,
        deleteEdge: state.deleteEdge,
        setSelectedNodes: state.setSelectedNodes
      }),
      shallow
    );
  const nodeStore = useNodeStoreRef();

  const handleSelect = useCallback(
    (id: string, additive: boolean) => {
      if (additive) {
        setLinkSelection(
          selectedLinkIds.includes(id)
            ? selectedLinkIds.filter((selected) => selected !== id)
            : [...selectedLinkIds, id]
        );
        return;
      }
      setSelectedNodes([]);
      // Clear edge selection too, or Delete would remove those edges as well.
      const { edges, setEdgeSelectionState } = nodeStore.getState();
      const deselect: Record<string, boolean> = {};
      for (const edge of edges) {
        if (edge.selected) {
          deselect[edge.id] = false;
        }
      }
      if (Object.keys(deselect).length > 0) {
        setEdgeSelectionState(deselect);
      }
      setLinkSelection([id]);
    },
    [nodeStore, selectedLinkIds, setLinkSelection, setSelectedNodes]
  );

  if (links.length === 0) {
    return null;
  }

  return (
    <ViewportPortal>
      <svg style={LAYER_STYLE} aria-label="Lineage links">
        {links.map((link) => (
          <LinkPath
            key={link.id}
            link={link}
            selected={selectedLinkIds.includes(link.id)}
            onSelect={handleSelect}
            onDelete={deleteEdge}
          />
        ))}
      </svg>
    </ViewportPortal>
  );
};

export default memo(LinkLayer);

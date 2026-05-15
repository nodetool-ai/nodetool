/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback } from "react";
import type { DragEvent as ReactDragEvent } from "react";

import { Text } from "../ui_primitives";
import type { NodeMetadata } from "../../stores/ApiTypes";
import { IconForType } from "../../config/data_types";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import usePendingNodeCreateStore from "../../stores/PendingNodeCreateStore";
import { getPrimaryOutput } from "../node_types/contentCardRegistry";

const styles = (theme: Theme) =>
  css({
    "&.qa-tile": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: theme.spacing(0.5),
      padding: theme.spacing(1),
      borderRadius: "var(--rounded-sm)",
      background: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      cursor: "grab",
      transition: "border-color 120ms ease, background 120ms ease",
      userSelect: "none",
      "&:hover": {
        borderColor: theme.vars.palette.primary.main,
        background: theme.vars.palette.action.hover
      },
      "&:active": {
        cursor: "grabbing"
      }
    },
    ".qa-tile-icon": {
      width: 32,
      height: 32,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      "& svg": { fontSize: 28 }
    },
    ".qa-tile-label": {
      fontSize: theme.fontSizeSmall,
      textAlign: "center",
      lineHeight: 1.2,
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".qa-tile-new": {
      position: "absolute",
      top: 4,
      right: 4,
      fontSize: 9,
      lineHeight: 1,
      padding: "2px 4px",
      borderRadius: "var(--rounded-sm)",
      background: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText,
      textTransform: "uppercase",
      fontWeight: 700
    }
  });

interface QuickAccessTileProps {
  node: NodeMetadata;
}

/**
 * Single node tile in the quick-access grid. Drag to canvas to drop at the
 * cursor position; click to drop at the viewport center.
 */
const QuickAccessTile = memo<QuickAccessTileProps>(({ node }) => {
  const theme = useTheme();

  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const setDragToCreate = useNodeMenuStore((s) => s.setDragToCreate);
  const requestCreate = usePendingNodeCreateStore((s) => s.requestCreate);

  // Click-to-add: send the request through `PendingNodeCreateStore`. The
  // `<NodeCreateBridge />` mounted inside the editor's `ReactFlowProvider`
  // consumes it and creates the node at viewport center. This indirection
  // lets the tile live in the left panel (outside the provider).
  const handleClick = useCallback(() => {
    requestCreate(node);
  }, [requestCreate, node]);

  const handleDragStart = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      setDragToCreate(true);
      serializeDragData(
        { type: "create-node", payload: node },
        event.dataTransfer
      );
      event.dataTransfer.effectAllowed = "move";
      setActiveDrag({ type: "create-node", payload: node });
    },
    [node, setActiveDrag, setDragToCreate]
  );

  // Primary-output type drives the icon color (matches port coloring).
  const primary = getPrimaryOutput(node);
  const outputType =
    (primary?.type as { type?: string } | undefined)?.type ?? "";
  const isNew = (node as { is_new?: boolean }).is_new === true;

  return (
    <div
      css={styles(theme)}
      className="qa-tile"
      style={{ position: "relative" }}
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label={`Add ${node.title}`}
      title={node.title}
    >
      {isNew && <span className="qa-tile-new">new</span>}
      <span className="qa-tile-icon">
        <IconForType
          iconName={outputType || "any"}
          showTooltip={false}
          iconSize="medium"
        />
      </span>
      <Text className="qa-tile-label">{node.title}</Text>
    </div>
  );
});

QuickAccessTile.displayName = "QuickAccessTile";

export default QuickAccessTile;

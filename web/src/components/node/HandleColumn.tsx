/** @jsxImportSource @emotion/react */
/**
 * HandleColumn
 *
 * Vertical column of `HandleOnlyField`s pinned to the left edge of a
 * node body. Used by both the generic body and `ContentCardBody` to
 * render properties classified as `inputFields` — handle dots only,
 * evenly distributed top-to-bottom.
 *
 * Zero-width so it doesn't steal horizontal space from the main body
 * content. Pointer events re-enabled per child so handles stay
 * interactive while the body itself can stay click-through-friendly.
 */

import React, { memo, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { Property } from "../../stores/ApiTypes";
import type { Edge } from "@xyflow/react";
import HandleOnlyField from "./HandleOnlyField";
import { NODE_HEADER_MIN_HEIGHT } from "./NodeHeader";
import { SPACING, SPACING_PX, Z_INDEX } from "../ui_primitives";

export const HANDLE_ROW_HEIGHT = 18;
/** Row-to-row distance: row height, the row's bottom margin and the flex gap. */
export const HANDLE_ROW_PITCH =
  HANDLE_ROW_HEIGHT + SPACING_PX.md + SPACING_PX.micro;
/** Offset that centers the first handle row on the header row. */
const HEADER_ALIGNED_TOP = (NODE_HEADER_MIN_HEIGHT - HANDLE_ROW_HEIGHT) / 2;

const styles = (theme: Theme) =>
  css({
    "&.handle-column": {
      position: "absolute",
      top: theme.spacing(SPACING.xs),
      left: 0,
      width: 0,
      pointerEvents: "none",
      zIndex: Z_INDEX.raised,
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-start",
      gap: theme.spacing(SPACING.micro)
    },
    // Stacked (in-flow) variant: used by the generic body, where the column
    // shares the left edge with inline-field rows that carry their own
    // handles. Absolute positioning would stack both sets of dots at the top;
    // taking flow space instead reserves a band so the input handles sit
    // above the editor rows. Zero-width still, so it steals no horizontal room.
    "&.handle-column.handle-column--stacked": {
      position: "relative",
      top: "auto",
      zIndex: "auto",
      marginTop: theme.spacing(SPACING.xs),
      marginBottom: theme.spacing(SPACING.xs)
    },
    // Header-aligned variant: used when the column's positioned ancestor
    // contains the node header (OutputNode), where the floating variant's
    // `spacing(4)` offset is measured from above the header and leaves the
    // dot stranded in blank body below it. Centers the first row on the
    // header instead, matching where every other node puts its first input.
    "&.handle-column.handle-column--header": {
      top: HEADER_ALIGNED_TOP
    },
    // Band variant: the input side of `NodePortBand`, which owns the vertical
    // space and positions both columns, so the column starts at its top.
    "&.handle-column.handle-column--band": {
      top: 0
    },
    ".handle-only": {
      position: "relative",
      height: HANDLE_ROW_HEIGHT,
      flex: "0 0 auto",
      marginBottom: theme.spacing(SPACING.md),
      pointerEvents: "auto"
    },
    ".handle-only:last-child": {
      marginBottom: 0
    },
    "& .handle-only .react-flow__handle.react-flow__handle-left": {
      top: "50%",
      bottom: "auto",
      transform: "translate(0, -50%)",
      transformOrigin: "center"
    },
    "& .handle-only .react-flow__handle.react-flow__handle-left:hover": {
      transform: "translate(0, -50%) scale(1.3)"
    }
  });

interface HandleColumnProps {
  id: string;
  properties: Property[];
  /** Edges connected to this node (used to flag is-connected per property) */
  connectedEdges?: Edge[];
  className?: string;
  /**
   * `"floating"` (default) pins the column absolutely to the left edge — used
   * when the column overlays a preview area (content card, bespoke bodies).
   * `"stacked"` takes flow space instead, so the input handles reserve a band
   * above sibling inline-field rows in the generic body and don't crowd their
   * handles. `"header"` pins the column so its first handle centers on the
   * node header row — for bodies that render the header themselves.
   * `"band"` is the input side of `NodePortBand`.
   */
  layout?: "floating" | "stacked" | "header" | "band";
}

const HandleColumnImpl: React.FC<HandleColumnProps> = ({
  id,
  properties,
  connectedEdges,
  className,
  layout = "floating"
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  if (properties.length === 0) {
    return null;
  }

  const isConnected = (handleName: string): boolean =>
    !!connectedEdges?.some(
      (edge) => edge.target === id && edge.targetHandle === handleName
    );

  return (
    <div
      css={cssStyles}
      className={`handle-column${
        layout === "floating" ? "" : ` handle-column--${layout}`
      } ${className ?? ""}`}
    >
      {properties.map((property) => (
        <HandleOnlyField
          key={property.name}
          id={id}
          property={property}
          isConnected={isConnected(property.name)}
        />
      ))}
    </div>
  );
};

export const HandleColumn = memo(HandleColumnImpl);
HandleColumn.displayName = "HandleColumn";

export default HandleColumn;

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

import { Property, Edge } from "../../stores/ApiTypes";
import HandleOnlyField from "./HandleOnlyField";
import { Z_INDEX } from "../ui_primitives";

const HANDLE_ROW_HEIGHT = 18;

const styles = (theme: Theme) =>
  css({
    "&.handle-column": {
      position: "absolute",
      top: theme.spacing(4),
      left: 0,
      width: 0,
      pointerEvents: "none",
      zIndex: Z_INDEX.raised,
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-start",
      gap: theme.spacing(0.5)
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
      marginBottom: theme.spacing(1)
    },
    ".handle-only": {
      position: "relative",
      height: HANDLE_ROW_HEIGHT,
      flex: "0 0 auto",
      marginBottom: theme.spacing(2),
      pointerEvents: "auto"
    },
    ".handle-only:last-child": {
      marginBottom: 0
    },
    "& .handle-only .react-flow__handle.react-flow__handle-left": {
      top: "50%",
      bottom: "auto",
      transform: "translate(0, -50%)",
      transformOrigin: "right center"
    },
    "& .handle-only .react-flow__handle.react-flow__handle-left:hover": {
      transform: "translate(0, -50%) scale(1.75, 1.2)"
    }
  });

export interface HandleColumnProps {
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
   * handles.
   */
  layout?: "floating" | "stacked";
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
        layout === "stacked" ? " handle-column--stacked" : ""
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

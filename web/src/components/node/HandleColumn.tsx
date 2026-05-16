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

const styles = (theme: Theme) =>
  css({
    "&.handle-column": {
      position: "absolute",
      top: theme.spacing(1),
      bottom: theme.spacing(1),
      left: 0,
      width: 0,
      pointerEvents: "none",
      zIndex: 3,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-around",
      gap: theme.spacing(0.25)
    },
    ".handle-only": {
      position: "relative",
      minHeight: 0,
      pointerEvents: "auto"
    }
  });

export interface HandleColumnProps {
  id: string;
  properties: Property[];
  /** Edges connected to this node (used to flag is-connected per property) */
  connectedEdges?: Edge[];
  className?: string;
}

const HandleColumnImpl: React.FC<HandleColumnProps> = ({
  id,
  properties,
  connectedEdges,
  className
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
      className={`handle-column ${className ?? ""}`}
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

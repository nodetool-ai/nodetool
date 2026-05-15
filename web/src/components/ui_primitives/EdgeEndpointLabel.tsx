/** @jsxImportSource @emotion/react */
/**
 * EdgeEndpointLabel
 *
 * Small floating chip rendered near an edge endpoint, showing the
 * property name (e.g. "Prompt", "Image", "Result"). Used by the edge
 * renderer to label source/target endpoints on demand.
 *
 * Pure positional primitive — the call site is responsible for
 * computing (x, y) from edge geometry and for suppressing this chip
 * when it would overlap a sibling endpoint. Renders nothing when
 * `visible` is false.
 */

import React, { memo, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

const styles = (theme: Theme, color?: string) =>
  css({
    "&.edge-endpoint-label": {
      position: "absolute",
      transform: "translate(-50%, -50%)",
      padding: "1px 6px",
      borderRadius: 8,
      fontFamily: theme.fontFamily1,
      fontSize: "0.7rem",
      fontWeight: 500,
      lineHeight: 1.3,
      letterSpacing: "0.02em",
      color: theme.vars.palette.common.white,
      backgroundColor: color ?? theme.vars.palette.grey[800],
      border: `1px solid ${theme.vars.palette.grey[900]}`,
      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.4)",
      whiteSpace: "nowrap",
      pointerEvents: "none",
      userSelect: "none",
      zIndex: 5
    }
  });

export interface EdgeEndpointLabelProps {
  /** Text shown in the chip */
  label: string;
  /** Absolute x position (px) inside the edge layer */
  x: number;
  /** Absolute y position (px) inside the edge layer */
  y: number;
  /** Hide entirely when false. Defaults to true. */
  visible?: boolean;
  /**
   * Optional background color — usually derived from the edge's type
   * color via `colorForType`. Defaults to the neutral grey chip.
   */
  color?: string;
  className?: string;
}

const EdgeEndpointLabelInner: React.FC<EdgeEndpointLabelProps> = ({
  label,
  x,
  y,
  visible = true,
  color,
  className
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme, color), [theme, color]);

  if (!visible) {return null;}

  return (
    <div
      css={cssStyles}
      className={`edge-endpoint-label ${className ?? ""}`}
      style={{ left: x, top: y }}
    >
      {label}
    </div>
  );
};

export const EdgeEndpointLabel = memo(EdgeEndpointLabelInner);
EdgeEndpointLabel.displayName = "EdgeEndpointLabel";

export default EdgeEndpointLabel;

/** @jsxImportSource @emotion/react */
/**
 * NodePortBand
 *
 * The labeled port rows at the top of a node body: input handles down the
 * left edge, output handles down the right edge, paired row by row. The band
 * takes flow space for whichever side has more rows, so labels never sit on
 * top of a preview, an editor or the body's own content.
 *
 * Inputs render through `HandleColumn` (handle-only fields), outputs through
 * `NodeOutputs`; both keep their class names, so collapsed-node and
 * connection styling apply unchanged. A body that renders its outputs some
 * other way omits `outputs`.
 */

import React, { memo, useLayoutEffect, useMemo, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { Edge } from "@xyflow/react";

import type { OutputSlot, Property } from "../../stores/ApiTypes";
import HandleColumn, { HANDLE_ROW_HEIGHT, HANDLE_ROW_PITCH } from "./HandleColumn";
import NodeOutputs from "./NodeOutputs";
import { SPACING } from "../ui_primitives";
import { useNodeOutputSlots } from "../../hooks/nodes/useNodeOutputSlots";

const EMPTY_OUTPUTS: OutputSlot[] = [];
const EMPTY_PROPERTIES: Property[] = [];

/** A label alone on its row may run across the band, short of the far dot. */
const SOLE_LABEL_MAX_WIDTH = "calc(100cqw - 24px)";

const styles = (theme: Theme, inputRows: number, outputRows: number) =>
  css({
    "&.node-port-band": {
      position: "relative",
      flex: "0 0 auto",
      width: "100%",
      // Lets handle labels size against the band's width (`cqw`).
      containerType: "inline-size",
      marginTop: theme.spacing(SPACING.xs),
      marginBottom: theme.spacing(SPACING.xs)
    },
    // The band sits inside its body's side padding; the columns step back
    // out by that padding so every dot centers on the node edge.
    "&.node-port-band > .handle-column": {
      left: "calc(-1 * var(--port-band-inset-left, 0px))"
    },
    // Also outranks NodeOutputs' own `top` offset, which is measured for a
    // column pinned to a body's top edge rather than to this band.
    "&.node-port-band > .output-handle-column": {
      top: 0,
      right: "calc(-1 * var(--port-band-inset-right, 0px))"
    },
    // Rows past the other side's last row have no label facing them.
    [`& .handle-only:nth-of-type(n + ${outputRows + 1}) .handle-label`]: {
      maxWidth: SOLE_LABEL_MAX_WIDTH
    },
    [`& .output-handle-container:nth-of-type(n + ${inputRows + 1}) .handle-label`]:
      {
        maxWidth: SOLE_LABEL_MAX_WIDTH
      }
  });

/** Height of `rows` port rows: the last row has no trailing gap. */
const bandHeight = (rows: number): number =>
  rows === 0 ? 0 : HANDLE_ROW_HEIGHT + (rows - 1) * HANDLE_ROW_PITCH;

interface NodePortBandProps {
  id: string;
  /** Properties rendered as labeled input handles. */
  properties?: Property[];
  /** Static outputs; dynamic and code-inferred outputs are added. */
  outputs?: OutputSlot[];
  connectedEdges?: Edge[];
  className?: string;
}

const NodePortBandImpl: React.FC<NodePortBandProps> = ({
  id,
  properties = EMPTY_PROPERTIES,
  outputs,
  connectedEdges,
  className
}) => {
  const theme = useTheme();
  const outputSlots = useNodeOutputSlots(id, outputs ?? EMPTY_OUTPUTS);
  const inputRows = properties.length;
  const outputRows = outputSlots.length;
  const rows = Math.max(inputRows, outputRows);
  const cssStyles = useMemo(
    () => styles(theme, inputRows, outputRows),
    [theme, inputRows, outputRows]
  );
  const style = useMemo(() => ({ height: bandHeight(rows) }), [rows]);
  const bandRef = useRef<HTMLDivElement>(null);

  // Bodies pad their content differently. Read the parent's side padding
  // once it is laid out, rather than every body declaring it.
  useLayoutEffect(() => {
    const band = bandRef.current;
    const parent = band?.parentElement;
    if (!band || !parent) {
      return;
    }
    const { paddingLeft, paddingRight } = getComputedStyle(parent);
    band.style.setProperty("--port-band-inset-left", paddingLeft);
    band.style.setProperty("--port-band-inset-right", paddingRight);
  }, [rows]);

  if (rows === 0) {
    return null;
  }

  return (
    <div
      ref={bandRef}
      css={cssStyles}
      className={`node-port-band ${className ?? ""}`}
      style={style}
    >
      <HandleColumn
        id={id}
        properties={properties}
        connectedEdges={connectedEdges}
        layout="band"
      />
      {outputs && <NodeOutputs id={id} outputs={outputs} />}
    </div>
  );
};

export const NodePortBand = memo(NodePortBandImpl);
NodePortBand.displayName = "NodePortBand";

export default NodePortBand;

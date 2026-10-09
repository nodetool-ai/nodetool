/** @jsxImportSource @emotion/react */
/**
 * HandleLabel
 *
 * The visible name next to a handle dot: to the right of an input, to the
 * left of an output. Text takes the handle's type color through the
 * per-type `.handle-label.<slug>` rule in `GenerateCSS`. Purely visual: it
 * never takes pointer events, so the dot and its tooltip keep every
 * interaction. Hidden when the node is collapsed or the canvas is zoomed
 * out (see `collapsed.css` and `nodes.zoomed.css`).
 */

import React, { memo } from "react";
import { css } from "@emotion/react";

import { Slugify } from "../../utils/TypeHandler";

/** Clearance between the handle dot's center (the node edge) and the text. */
const LABEL_INSET = 10;
/**
 * Half the port band's width (a container, see `NodePortBand`), so an input
 * and an output label on one row never meet mid-node. A row with only one
 * label gets the full width there. Longer names ellipsize; the tooltip has
 * the rest.
 */
const LABEL_MAX_WIDTH = `calc(50cqw - ${LABEL_INSET + 4}px)`;

const styles = css({
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  maxWidth: LABEL_MAX_WIDTH,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  pointerEvents: "none",
  userSelect: "none",
  fontFamily: "var(--fontFamily2)",
  fontSize: "var(--fontSizeSmaller)",
  lineHeight: 1,
  "&.handle-label--input": {
    left: LABEL_INSET,
    textAlign: "left"
  },
  "&.handle-label--output": {
    right: LABEL_INSET,
    textAlign: "right"
  }
});

interface HandleLabelProps {
  text: string;
  /** Type name of the handle, colors the label like its dot. */
  type: string;
  side: "input" | "output";
}

const HandleLabelImpl: React.FC<HandleLabelProps> = ({ text, type, side }) => (
  <span
    css={styles}
    className={`handle-label handle-label--${side} ${Slugify(type)}`}
    aria-hidden="true"
  >
    {text}
  </span>
);

export const HandleLabel = memo(HandleLabelImpl);
HandleLabel.displayName = "HandleLabel";

export default HandleLabel;

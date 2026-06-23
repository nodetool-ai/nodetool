/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { MOTION } from "../ui_primitives";

const hrStyles = css`
  border: none;
  border-top: 2px solid var(--palette-c_overlay_strong);
  margin: 1em 0;
  cursor: pointer;
  transition: ${MOTION.border};

  &:hover {
    border-top-color: var(--palette-c_overlay_strong);
  }
`;

export function HorizontalRuleComponent() {
  return <hr css={hrStyles} />;
}

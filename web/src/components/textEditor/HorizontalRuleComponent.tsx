/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { MOTION } from "../ui_primitives";

const hrStyles = css`
  border: none;
  border-top: 2px solid rgba(255, 255, 255, 0.2);
  margin: 1em 0;
  cursor: pointer;
  transition: ${MOTION.border};

  &:hover {
    border-top-color: rgba(255, 255, 255, 0.4);
  }
`;

export function HorizontalRuleComponent() {
  return <hr css={hrStyles} />;
}

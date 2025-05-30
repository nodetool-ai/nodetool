/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { Button } from "@mui/material";
import { pulse } from "./animations";

interface ThoughtToggleProps {
  isExpanded: boolean;
  hasClosingTag: boolean;
  onClick: () => void;
}

export const ThoughtToggle: React.FC<ThoughtToggleProps> = ({
  isExpanded,
  hasClosingTag,
  onClick
}) => {
  const buttonStyles = css`
    text-transform: none;
    color: inherit;
    opacity: 0.7;
    &:hover {
      opacity: 1;
    }
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  const pulsingDotStyles = css`
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: currentColor;
    animation: ${pulse} 1.5s ease-in-out infinite;
  `;

  return (
    <Button size="small" onClick={onClick} css={buttonStyles}>
      {!hasClosingTag ? (
        <>
          <div css={pulsingDotStyles} />
          Show thought
        </>
      ) : (
        `${isExpanded ? "Hide thought" : "Show thought"}`
      )}
    </Button>
  );
};
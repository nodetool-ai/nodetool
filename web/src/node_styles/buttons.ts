/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

/**
 * Button Component Styles
 * Using CSS variables from Material-UI theme system
 */

export const buttonStyles = css`
  .MuiButton-root {
    min-width: 36px !important;
  }

  .MuiButton-sizeSmall {
    margin: 0.5em !important;
    padding: 0.25em 0.5em !important;
    min-width: 20px !important;
    background-color: var(--palette-grey-900);
  }

  .MuiButton-sizeSmall:hover {
    background-color: var(--palette-grey-800);
  }

  .MuiButton-medium {
    padding: 0.2em 0.4em !important;
    line-height: 1.1em !important;
  }
`;

export const smallButtonStyle = (theme: Theme) => css`
  margin: 2px;
  padding: 2px 6px;
  height: 15px;
  font-size: ${theme.fontSizeSmall};
  min-width: 20px;
  background-color: var(--palette-grey-600);

  &:hover {
    background-color: var(--palette-grey-500);
  }
`;

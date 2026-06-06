/** @jsxImportSource @emotion/react */
import { css, SerializedStyles } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

export const getSharedSettingsStyles = (theme: Theme): SerializedStyles => {
  return css`
    display: flex;
    flex-direction: column;
    height: 100%;
    padding-top: 1em;

    .save-button-container {
      position: sticky;
      bottom: 0;
      z-index: 10;
      padding: 0.75em 0;
      display: flex;
      justify-content: flex-end;
      background: linear-gradient(transparent, ${theme.vars.palette.background.default} 30%);
    }

    .save-button {
      padding: 0.4em 1.5em;
      font-family: ${theme.fontFamily2};
      color: ${theme.vars.palette.primary.contrastText};
      background-color: ${theme.vars.palette.primary.main};
      border-radius: 6px;
      text-transform: none;
      font-size: ${theme.fontSizeSmall};
      font-weight: 500;
      &:hover {
        box-shadow: 0 2px 6px ${theme.vars.palette.grey[900]}33;
      }
    }

    .show-hide-button {
      color: red;
      min-width: 18em;
      margin-top: 0.5em;
      padding: 0.5em;
    }

    h2 {
      font-size: ${theme.fontSizeBigger};
      margin: 0.5em 0 0.3em 0;
      padding: 0;
      font-weight: 500;
      color: var(--palette-primary-main);
    }

    .secrets {
      display: flex;
      align-items: center;
      gap: 0.6em;
      color: ${theme.vars.palette.text.secondary};
      padding: 0.4em 0;
      font-size: ${theme.fontSizeSmall};
      margin: 0 0 0.5em;
      border: none;
      outline: none;
    }

    .description {
      margin-top: 0.25em;
      opacity: 0.85;
      color: ${theme.vars.palette.grey[100]};
      font-size: ${theme.fontSizeSmall};
      line-height: 1.5;
      max-width: 60ch;
    }

    a {
      color: ${theme.vars.palette.primary.main};
      text-decoration: none;
      transition: color 0.2s ease;

      &:hover {
        color: ${theme.vars.palette.primary.light};
        text-decoration: underline;
      }
    }

    .settings-section {
      padding: 0;
      margin: 0 0 0.5em 0;
      width: 100%;
      display: flex;
      flex-direction: column;

      h2 {
        font-size: ${theme.fontSizeBigger};
        margin: 0.5em 0 0.3em 0;
        padding: 0;
        font-weight: 500;
        color: var(--palette-primary-main);
      }
    }

    .settings-item {
      display: flex;
      flex-direction: column;
      gap: 0.5em;
      padding: 0.9em 0;

      /* Block-style label sitting above the field, matching the General tab. */
      .MuiInputLabel-root {
        position: relative;
        transform: none;
        margin-bottom: 0.4em;
        font-size: ${theme.fontSizeNormal};
        font-weight: 600;
        letter-spacing: 0.01em;
        color: ${theme.vars.palette.grey[0]};
      }

      .MuiTextField-root {
        width: 100%;
        max-width: 34em;
      }

      .MuiInputBase-root {
        max-width: 34em;
        background-color: ${theme.vars.palette.background.paper};
        border: 1px solid ${theme.vars.palette.divider};
        border-radius: 0.3em;
        padding: 0.3em 1em;
        font-size: ${theme.fontSizeNormal};
        transition: border-color 0.2s ease;

        &::before,
        &::after {
          content: none;
        }

        &:hover {
          border-color: ${theme.vars.palette.grey[300]};
        }

        &.Mui-focused {
          border-color: ${theme.vars.palette.primary.main};
        }
      }
    }

    .settings-item.large {
      padding: 0.9em 0;
    }

    .settings-main-content {
      padding: 0.5em 0;
      width: 100%;
    }
  `;
};

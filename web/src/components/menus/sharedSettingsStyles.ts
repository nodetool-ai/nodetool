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
      position: absolute;
      top: 49px;
      right: 10px;
      z-index: 100;
      margin: 0;
      padding: 0.75em 0;
      display: flex;
      justify-content: center;
      width: 100%;
    }

    .save-button {
      position: absolute;
      bottom: 20px;
      right: 10px;
      padding: 0.5em 2.5em;
      font-family: ${theme.fontFamily2};
      word-spacing: -0.2em;
      color: ${theme.vars.palette.primary.contrastText};
      background-color: ${theme.vars.palette.primary.main};
      border-radius: 8px;
      text-transform: none;
      font-size: ${theme.fontSizeNormal};
      transition: all 0.2s ease;
      font-weight: 500;
      letter-spacing: 0.02em;
      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      }
    }

    .show-hide-button {
      color: red;
      min-width: 18em;
      margin-top: 0.5em;
      padding: 0.5em;
    }

    h1 {
      font-size: ${theme.fontSizeGiant};
      margin-bottom: 1rem;
      font-weight: 500;
    }

    .settings-section-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    h2 {
      font-size: ${theme.fontSizeBigger};
      margin: 1.5em 0 0.5em 0;
      padding: 0;
      font-weight: 500;
      color: ${"var(--palette-primary-main)"};
      position: relative;
      display: inline-block;
    }

    .secrets {
      display: flex;
      align-items: center;
      gap: 0.8em;
      background-color: rgba(255, 152, 0, 0.1);
      padding: 0.8em 1.2em;
      border-radius: 6px;
      margin: 1em 0 2em;
      border-left: 3px solid #ff9800;
    }

    .description {
      margin-top: 1em;
      opacity: 0.8;
      font-size: 0.9em;
      line-height: 1.5;
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
      background: "transparent";
      backdropfilter: blur(20px);
      borderradius: 8px;
      padding: 1.2em;
      margin: 1.5em 0 1.5em 0;
      boxshadow: 0 2px 12px rgba(0, 0, 0, 0.2);
      border: 1px solid ${theme.vars.palette.grey[600]};
      width: 100%;
      display: flex;
      flexdirection: column;
      gap: 0.8em;
      margin-bottom: 2rem;

      h2 {
        font-size: ${theme.fontSizeBigger};
        margin: 1.5em 0 0.5em 0;
        padding: 0;
        font-weight: 500;
        color: ${"var(--palette-primary-main)"};
        position: relative;
        display: inline-block;
      }
    }

    .settings-item {
      display: flex;
      flex-direction: column;
      gap: 0.8em;
      margin-bottom: 1.5rem;

      .MuiTextField-root {
        width: 100%;
      }
    }

    .settings-main-content {
      padding: 1em 2em;
      max-width: 800px;
      margin: 0 auto;
      width: 100%;
    }
  `;
};

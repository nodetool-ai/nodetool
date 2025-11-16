/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import { useRouteError } from "react-router-dom";
import { Typography, Box, Button, ThemeProvider } from "@mui/material";
import { CopyToClipboardButton } from "./components/common/CopyToClipboardButton";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

const errorBoundaryStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "95vh",
    textAlign: "center",
    padding: "2em",
    background: "var(--palette-background-default)",

    ".logo": {
      width: 120,
      height: 120,
      marginBottom: "2rem"
    },

    ".error-title": {
      marginBottom: "1rem",
      fontSize: "5em",
      fontWeight: 500,
      userSelect: "all"
    },

    ".error-message": {
      maxWidth: "80vw",
      padding: "1em",
      color: theme.vars.palette.grey[100],
      marginBottom: "2em",
      fontSize: "1.2rem",
      lineHeight: 1.6,
      userSelect: "all"
    },

    ".error-text": {
      width: "80vw",
      color: theme.vars.palette.grey[100],
      fontFamily: theme.fontFamily2,
      fontSize: "1.1rem",
      margin: "2em 0 2em",
      padding: "1em 2em",
      lineHeight: 1.6,
      userSelect: "all"
    },

    ".issue-tracker-link": {
      color: theme.vars.palette.c_link,
      textDecoration: "underline",
      padding: "0.25em 0.5em",
      "&:hover": {
        color: theme.vars.palette.c_link_visited
      }
    },

    ".refresh-button": {
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.grey[1000],
      padding: "1em 2em",
      fontSize: "1.1rem",
      "&:hover": {
        backgroundColor: theme.vars.palette.primary.dark
      }
    },

    ".error-stack-trace": {
      color: theme.vars.palette.grey[50],
      border: "2px solid var(--palette-background-paper)",
      fontFamily: "monospace",
      fontSize: "1rem",
      margin: "1em 0 0",
      padding: "1em",
      whiteSpace: "pre-wrap",
      wordBreak: "break-all",
      maxHeight: "300px",
      overflowY: "auto",
      userSelect: "all",
      lineHeight: 1.5
    }
  });

const ErrorBoundary: React.FC = () => {
  const error = useRouteError();
  const theme = useTheme();

  const errorMessage =
    error instanceof Error
      ? error.message
      : "An unknown error occurred" + JSON.stringify(error);
  const stackTrace =
    error instanceof Error ? error.stack : "No stack trace available";

  return (
    <ThemeProvider theme={theme}>
      <Box css={errorBoundaryStyles(theme)}>
        <img src="/logo192.png" alt="NodeTool Logo" className="logo" />
        <Typography className="error-title">💩</Typography>
        <Typography variant="h6" className="error-message">
          If this happens again, please let us know in the
          <a
            href="https:forum.nodetool.ai"
            style={{
              textDecoration: "none",
              border: "1px solid",
              padding: "0.1em 0.25em",
              marginLeft: "0.5em"
            }}
            className="forum-link"
            target="_blank"
            rel="noreferrer"
          >
            forum
          </a>
        </Typography>
        <Button
          variant="contained"
          size="large"
          onClick={() => window.location.reload()}
          className="refresh-button"
        >
          Reload
        </Button>

        <Typography variant="body1" className="error-text">
          {errorMessage}
        </Typography>
        <Box position="relative" width="100%" maxWidth="80vw">
          <CopyToClipboardButton
            copyValue={stackTrace}
            tooltipPlacement="top"
            size="large"
            sx={{ position: "absolute", top: 25, right: 5 }}
          />
          <Typography variant="body1" className="error-stack-trace">
            {stackTrace}
          </Typography>
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default ErrorBoundary;

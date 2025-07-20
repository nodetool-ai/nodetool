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
    background: `linear-gradient(to bottom, ${theme.vars.palette.grey[800]}, ${theme.vars.palette.grey[900]})`,

    ".logo": {
      width: 100,
      height: 100,
      marginBottom: "1rem"
    },

    ".error-title": {
      color: theme.vars.palette.error.main,
      marginBottom: theme.spacing?.(2) || "16px",
      userSelect: "all"
    },

    ".error-message": {
      maxWidth: 600,
      padding: "2em 0 1em",
      color: theme.vars.palette.grey[100],
      marginBottom: theme.spacing?.(2) || "16px",
      userSelect: "all"
    },
    ".error-text": {
      color: theme.vars.palette.grey[100],
      backgroundColor: theme.vars.palette.grey[900],
      border: "1px solid " + theme.vars.palette.grey[800],
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      margin: "4em 0 0",
      padding: "2em 3em",
      userSelect: "all"
    },

    ".issue-tracker-link": {
      color: theme.vars.palette.c_link,
      "&:hover": {
        color: theme.vars.palette.c_link_visited
      }
    },

    ".refresh-button": {
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.grey[1000],
      "&:hover": {
        backgroundColor: theme.vars.palette.primary.dark
      }
    },

    ".error-stack-trace": {
      color: theme.vars.palette.grey[50],
      backgroundColor: theme.vars.palette.grey[900],
      border: "1px solid " + theme.vars.palette.grey[800],
      fontFamily: "monospace",
      fontSize: theme.fontSizeSmaller,
      margin: "1em 0 0",
      padding: "1em",
      whiteSpace: "pre-wrap",
      wordBreak: "break-all",
      maxHeight: "200px",
      overflowY: "auto",
      userSelect: "all"
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
      <Box css={errorBoundaryStyles}>
        <img src="/logo192.png" alt="NodeTool Logo" className="logo" />
        <Typography variant="h4" className="error-title">
          NodeTool has encountered an error
        </Typography>
        <Typography variant="body2" className="error-message">
          If this happens again, please let us know in the{" "}
          <a
            href="https:forum.nodetool.ai"
            className="issue-tracker-link"
            target="_blank"
            rel="noreferrer"
          >
            forum
          </a>
          .
        </Typography>
        <Button
          variant="contained"
          onClick={() => window.location.reload()}
          className="refresh-button"
        >
          Refresh the page
        </Button>

        <Typography variant="body2" className="error-text">
          {errorMessage}
        </Typography>
        <Box position="relative" width="100%" maxWidth={600}>
          <CopyToClipboardButton
            textToCopy={stackTrace || ""}
            tooltipPlacement="top"
            sx={{ position: "absolute", top: 4, right: 4 }}
          />
          <Typography variant="body2" className="error-stack-trace">
            {stackTrace}
          </Typography>
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default ErrorBoundary;

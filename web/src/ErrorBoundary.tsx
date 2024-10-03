/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import { useRouteError } from "react-router-dom";
import { motion } from "framer-motion";
import { Typography, Box, Button, ThemeProvider } from "@mui/material";
import ThemeNodetool from "./components/themes/ThemeNodetool";

const errorBoundaryStyles = (theme: any) =>
  css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "95vh",
    textAlign: "center",
    background: `linear-gradient(to bottom, ${theme.palette?.c_gray1}, ${theme.palette?.c_gray0})`,

    ".logo": {
      width: 100,
      height: 100,
      marginBottom: "1rem"
    },

    ".error-title": {
      color: theme.palette?.c_error,
      marginBottom: theme.spacing?.(2) || "16px"
    },

    ".error-message": {
      maxWidth: 600,
      padding: "2em 0 1em",
      marginBottom: theme.spacing?.(2) || "16px"
    },
    ".error-text": {
      color: theme.palette.c_white,
      backgroundColor: theme.palette?.c_gray0,
      border: "1px solid " + theme.palette?.c_gray1,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      margin: "4em 0 0",
      padding: "2em 3em"
    },

    ".issue-tracker-link": {
      color: theme.palette?.c_link,
      "&:hover": {
        color: theme.palette?.c_link_visited
      }
    },

    ".refresh-button": {
      backgroundColor: theme.palette?.c_hl1,
      color: theme.palette?.c_black,
      "&:hover": {
        backgroundColor: theme.palette?.c_hl2
      }
    },

    ".error-stack-trace": {
      color: theme.palette.c_white,
      backgroundColor: theme.palette.c_gray0,
      border: "1px solid " + theme.palette.c_gray1,
      fontFamily: "monospace",
      fontSize: theme.fontSizeSmaller,
      margin: "1em 0 0",
      padding: "1em",
      whiteSpace: "pre-wrap",
      wordBreak: "break-all",
      maxHeight: "200px",
      overflowY: "auto"
    }
  });

const ErrorBoundary: React.FC = () => {
  const error = useRouteError();
  console.error(error);

  const errorMessage =
    error instanceof Error ? error.message : "An unknown error occurred";
  const stackTrace =
    error instanceof Error ? error.stack : "No stack trace available";

  return (
    <ThemeProvider theme={ThemeNodetool}>
      <Box css={errorBoundaryStyles}>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <img src="/logo192.png" alt="NodeTool Logo" className="logo" />
        </motion.div>
        <Typography variant="h2" className="error-title">
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
        <Typography variant="body2" className="error-stack-trace">
          {stackTrace}
        </Typography>
      </Box>
    </ThemeProvider>
  );
};

export default ErrorBoundary;

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useState } from "react";
import { useRouteError } from "react-router-dom";
import { Box, Button, ThemeProvider } from "@mui/material";
import { CopyButton, Text } from "./components/ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

const errorBoundaryStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: "2em 1.5em",
    background: "var(--palette-background-default)",
    boxSizing: "border-box",

    ".hero": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "0.75rem",
      marginBottom: "2rem"
    },

    ".logo": {
      width: 72,
      height: 72,
      opacity: 0.85
    },

    ".heading": {
      fontSize: "1.5rem",
      fontWeight: 600,
      color: theme.vars.palette.grey[100],
      letterSpacing: "-0.01em"
    },

    ".subtext": {
      maxWidth: 460,
      textAlign: "center",
      color: theme.vars.palette.grey[300],
      fontSize: "0.95rem",
      lineHeight: 1.7
    },

    ".actions": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "1.25rem",
      marginBottom: "2.5rem"
    },

    ".button-row": {
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      flexWrap: "wrap",
      justifyContent: "center"
    },

    ".reload-button": {
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.grey[1000],
      padding: "0.6em 2.5em",
      fontSize: "1rem",
      fontWeight: 500,
      borderRadius: "var(--rounded-md)",
      textTransform: "none",
      "&:hover": {
        backgroundColor: theme.vars.palette.primary.dark
      }
    },

    ".copy-error-button": {
      padding: "0.6em 1.5em",
      fontSize: "1rem",
      fontWeight: 500,
      borderRadius: "var(--rounded-md)",
      textTransform: "none",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      color: theme.vars.palette.grey[100],
      "&:hover": {
        borderColor: theme.vars.palette.grey[500],
        background: "rgba(255,255,255,0.03)"
      }
    },

    ".contact-row": {
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      flexWrap: "wrap",
      justifyContent: "center"
    },

    ".contact-link": {
      display: "inline-flex",
      alignItems: "center",
      gap: "0.4em",
      color: theme.vars.palette.grey[100],
      textDecoration: "none",
      fontSize: "0.95rem",
      fontWeight: 500,
      padding: "0.45em 1em",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      borderRadius: "var(--rounded-md)",
      transition: "all 0.15s ease",
      "&:hover": {
        borderColor: theme.vars.palette.c_link,
        color: theme.vars.palette.c_link,
        background: "rgba(255,255,255,0.03)"
      }
    },

    ".details-section": {
      width: "100%",
      maxWidth: 720,
      display: "flex",
      flexDirection: "column",
      alignItems: "center"
    },

    ".details-toggle": {
      fontSize: "0.8rem",
      color: theme.vars.palette.grey[500],
      textTransform: "none",
      marginBottom: "0.5rem",
      "&:hover": {
        background: "transparent",
        color: theme.vars.palette.grey[300]
      }
    },

    ".error-summary": {
      width: "100%",
      color: theme.vars.palette.grey[200],
      fontFamily: theme.fontFamily2,
      fontSize: "0.9rem",
      padding: "0.75em 1em",
      lineHeight: 1.6,
      textAlign: "center",
      wordBreak: "break-word"
    },

    ".stack-wrapper": {
      position: "relative",
      width: "100%"
    },

    ".error-stack-trace": {
      width: "100%",
      boxSizing: "border-box",
      color: theme.vars.palette.grey[50],
      border: `1px solid ${theme.vars.palette.grey[800]}`,
      borderRadius: "var(--rounded-md)",
      fontFamily: "monospace",
      fontSize: "0.8rem",
      padding: "1em",
      whiteSpace: "pre-wrap",
      wordBreak: "break-all",
      maxHeight: 260,
      overflowY: "auto",
      userSelect: "all",
      lineHeight: 1.55
    }
  });

const ErrorBoundary: React.FC = () => {
  const error = useRouteError();
  const theme = useTheme();
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const errorMessage =
    error instanceof Error
      ? error.message
      : "An unknown error occurred" + JSON.stringify(error);
  const stackTrace =
    error instanceof Error ? error.stack : "No stack trace available";

  const fullErrorText = `${errorMessage}\n\n${stackTrace}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullErrorText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <ThemeProvider theme={theme}>
      <Box css={errorBoundaryStyles(theme)}>
        <Box className="hero">
          <img src="/logo192.png" alt="NodeTool Logo" className="logo" />
          <Text className="heading">Something went wrong</Text>
          <Text className="subtext">
            An unexpected error occurred. You can try reloading the page. If
            this keeps happening, please reach out so we can fix it.
          </Text>
        </Box>

        <Box className="actions">
          <Box className="button-row">
            <Button
              variant="contained"
              size="large"
              onClick={() => window.location.reload()}
              className="reload-button"
            >
              Reload page
            </Button>
            <Button
              variant="outlined"
              size="large"
              onClick={handleCopy}
              className="copy-error-button"
            >
              {copied ? "Copied!" : "Copy error"}
            </Button>
          </Box>
          <Box className="contact-row">
            <a
              href="https://discord.gg/GQqBKAWD"
              className="contact-link"
              target="_blank"
              rel="noreferrer"
            >
              Join our Discord
            </a>
            <a href="mailto:hello@nodetool.ai" className="contact-link">
              Email hello@nodetool.ai
            </a>
          </Box>
        </Box>

        <Box className="details-section">
          <Button
            className="details-toggle"
            disableRipple
            onClick={() => setShowDetails((prev) => !prev)}
          >
            {showDetails ? "Hide details ▲" : "Show details ▼"}
          </Button>

          {showDetails && (
            <>
              <Text className="error-summary">
                {errorMessage}
              </Text>
              <Box className="stack-wrapper">
                <CopyButton
                  value={stackTrace}
                  tooltipPlacement="top"
                  buttonSize="medium"
                  sx={{ position: "absolute", top: 6, right: 6, zIndex: 1 }}
                />
                <Text component="pre" className="error-stack-trace">
                  {stackTrace}
                </Text>
              </Box>
            </>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default ErrorBoundary;

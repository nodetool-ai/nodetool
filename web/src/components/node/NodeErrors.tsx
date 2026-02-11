/** @jsxImportSource @emotion/react */
import { memo, useState, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import { Box, Typography, Collapse, IconButton, Divider, Alert } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import useErrorStore from "../../stores/ErrorStore";
import isEqual from "lodash/isEqual";
import { CopyButton } from "../ui_primitives";
import {
  categorizeError,
  CategorizedError,
  ErrorSeverity,
  ErrorCategory
} from "../../utils/errorTypes";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

export const errorStyles = (theme: Theme, severity: ErrorSeverity) =>
  css({
    position: "relative",
    backgroundColor: getSeverityBackgroundColor(severity, theme),
    borderRadius: "1px",
    padding: "10px",
    transition: "background-color 0.2s",
    display: "flex",
    width: "100%",
    maxWidth: "100%",

    ".error-text": {
      width: "100%",
      maxHeight: "18em",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[1000],
      cursor: "auto",
      userSelect: "text",
      lineHeight: "1.2em",
      padding: "0.5em .2em 0 0",
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      wordBreak: "break-word",
      overflowY: "auto",
      "&::selection": {
        backgroundColor: theme.vars.palette.grey[0]
      }
    },
  });

/**
 * Get background color based on error severity
 */
function getSeverityBackgroundColor(severity: ErrorSeverity, theme: Theme): string {
  switch (severity) {
    case "critical":
      return theme.vars.palette.error.dark || "#d32f2f";
    case "error":
      return theme.vars.palette.error.main || "#f44336";
    case "warning":
      return theme.vars.palette.warning.main || "#ff9800";
    case "info":
    default:
      return theme.vars.palette.info.main || "#2196f3";
  }
}

/**
 * Get Alert severity based on error severity
 */
function getAlertSeverity(severity: ErrorSeverity): "error" | "warning" | "info" {
  switch (severity) {
    case "critical":
    case "error":
      return "error";
    case "warning":
      return "warning";
    case "info":
    default:
      return "info";
  }
}

export const NodeErrors: React.FC<{ id: string; workflow_id: string }> = ({
  id,
  workflow_id
}) => {
  const theme = useTheme();
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(false);

  const error = useErrorStore((state) =>
    workflow_id !== undefined ? state.getError(workflow_id, id) : undefined
  );

  // Hooks must be called before any early returns
  const toggleSuggestions = useCallback(() => {
    setSuggestionsExpanded((prev) => !prev);
  }, []);

  // Categorize the error
  const categorizedError = useMemo<CategorizedError>(() => {
    if (!error) {
      // Return a default empty error if no error exists
      return {
        error: "",
        severity: ErrorSeverity.INFO,
        category: ErrorCategory.GENERIC,
        title: "",
        suggestions: []
      };
    }
    return categorizeError(error);
  }, [error]);

  if (!error) {
    return null;
  }

  // Extract error message for display and copy
  let errorDisplay: React.ReactNode = '';
  if (typeof error === 'string') {
    errorDisplay = error;
  } else if (error instanceof Error) {
    errorDisplay = error.message;
  } else if (error && typeof error === 'object' && 'message' in error) {
    errorDisplay = String(error.message);
  } else if (error) {
    errorDisplay = JSON.stringify(error);
  }

  const hasSuggestions = categorizedError.suggestions.length > 0;

  return (
    <div
      css={errorStyles(theme, categorizedError.severity)}
      className="node-error nodrag nowheel"
    >
      <Box sx={{ position: "absolute", top: 10, right: 10 }}>
        <CopyButton
          value={errorDisplay}
          tooltip="Copy to clipboard"
        />
      </Box>

      {/* Error title and category */}
      <Box sx={{ mb: 1, pr: 4 }}>
        <Alert
          severity={getAlertSeverity(categorizedError.severity)}
          sx={{
            py: 0,
            px: 1,
            bgcolor: "transparent",
            color: "inherit",
            "& .MuiAlert-icon": {
              fontSize: "1rem"
            }
          }}
        >
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              fontSize: "0.65rem"
            }}
          >
            {categorizedError.title}
          </Typography>
        </Alert>
      </Box>

      {/* Error message */}
      <div className="error-text">{errorDisplay}</div>

      {/* Suggestions section */}
      {hasSuggestions && (
        <>
          <Divider sx={{ my: 1, borderColor: "rgba(255,255,255,0.2)" }} />
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mt: 1
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontWeight: 500,
                fontSize: "0.7rem",
                color: "rgba(255,255,255,0.9)"
              }}
            >
              Suggestions ({categorizedError.suggestions.length})
            </Typography>
            <IconButton
              size="small"
              onClick={toggleSuggestions}
              sx={{
                color: "rgba(255,255,255,0.8)",
                p: 0.5,
                "&:hover": {
                  bgcolor: "rgba(255,255,255,0.1)"
                }
              }}
            >
              {suggestionsExpanded ? (
                <ExpandLessIcon sx={{ fontSize: "1rem" }} />
              ) : (
                <ExpandMoreIcon sx={{ fontSize: "1rem" }} />
              )}
            </IconButton>
          </Box>

          <Collapse in={suggestionsExpanded} timeout="auto" unmountOnExit>
            <Box
              sx={{
                mt: 1,
                bgcolor: "rgba(0,0,0,0.2)",
                borderRadius: 1,
                p: 1
              }}
            >
              {categorizedError.suggestions.map((suggestion, idx) => (
                <Box
                  key={idx}
                  sx={{
                    mb: idx < categorizedError.suggestions.length - 1 ? 1 : 0,
                    pb: idx < categorizedError.suggestions.length - 1 ? 1 : 0,
                    borderBottom:
                      idx < categorizedError.suggestions.length - 1
                        ? "1px solid rgba(255,255,255,0.1)"
                        : "none"
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      display: "block",
                      fontWeight: 500,
                      fontSize: "0.7rem",
                      color: "rgba(255,255,255,0.95)",
                      mb: 0.25
                    }}
                  >
                    • {suggestion.action}
                  </Typography>
                  {suggestion.reason && (
                    <Typography
                      variant="caption"
                      sx={{
                        display: "block",
                        fontSize: "0.65rem",
                        color: "rgba(255,255,255,0.7)",
                        fontStyle: "italic",
                        ml: 1
                      }}
                    >
                      {suggestion.reason}
                    </Typography>
                  )}
                  {suggestion.docLink && (
                    <Typography
                      variant="caption"
                      sx={{
                        display: "block",
                        fontSize: "0.65rem",
                        color: "rgba(255,255,255,0.6)",
                        ml: 1,
                        mt: 0.25
                      }}
                    >
                      Learn more: {suggestion.docLink}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          </Collapse>
        </>
      )}
    </div>
  );
};

export default memo(NodeErrors, isEqual);

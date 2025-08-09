/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { Typography, Box, Button } from "@mui/material";
import { ThemeContext } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

const searchErrorBoundaryStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "200px",
    textAlign: "center",
    background: theme.vars.palette.c_gray0,
    border: `1px solid ${theme.vars.palette.c_gray1}`,
    borderRadius: "8px",
    margin: "1rem",
    padding: "2rem",

    ".error-title": {
      color: theme.vars.palette.error.main,
      marginBottom: theme.spacing?.(1) || "8px",
      fontSize: theme.fontSizeNormal
    },

    ".error-message": {
      maxWidth: 400,
      marginBottom: theme.spacing?.(2) || "16px",
      color: theme.vars.palette.c_gray4,
      fontSize: theme.fontSizeSmaller
    },

    ".retry-button": {
      backgroundColor: theme.vars.palette.c_hl1,
      color: theme.vars.palette.grey[1000],
      textTransform: "none",
      fontSize: theme.fontSizeSmaller,
      "&:hover": {
        backgroundColor: theme.vars.palette.c_hl2
      }
    }
  });

interface SearchErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface SearchErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  onRetry?: () => void;
}

class SearchErrorBoundary extends React.Component<
  SearchErrorBoundaryProps,
  SearchErrorBoundaryState
> {
  static contextType = ThemeContext;

  declare context: Theme;

  constructor(props: SearchErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): SearchErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Search component error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onRetry?.();
  };

  render() {
    const theme = this.context as Theme;
    const boundaryStyles = searchErrorBoundaryStyles(theme);

    if (this.state.hasError) {
      return (
        <Box css={boundaryStyles}>
          <Typography variant="h6" className="error-title">
            {this.props.fallbackTitle || "Search Error"}
          </Typography>
          <Typography variant="body2" className="error-message">
            Something went wrong with the search functionality. Please try
            again.
          </Typography>
          <Button
            variant="contained"
            onClick={this.handleRetry}
            className="retry-button"
            size="small"
          >
            Try Again
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default SearchErrorBoundary;

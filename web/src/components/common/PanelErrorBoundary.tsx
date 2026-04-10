import React from "react";
import { Box } from "@mui/material";
import { Text } from "../ui_primitives";
import log from "loglevel";

interface PanelErrorBoundaryProps {
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

interface PanelErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

/**
 * Error boundary component for catching and handling rendering errors in panel components.
 * Used to prevent one panel's error from crashing the entire application.
 *
 * Note: React error boundaries require class components as they need lifecycle methods
 * (getDerivedStateFromError and componentDidCatch) that are not available in functional components.
 */
export default class PanelErrorBoundary extends React.Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  constructor(props: PanelErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log panel errors for debugging while preventing the entire app from crashing
    log.error("Panel crashed:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <Box
            sx={{
              padding: 3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 200,
              bgcolor: "error.dark",
              color: "error.contrastText",
              borderRadius: 1
            }}
          >
            <Text size="small" component="div">
              Panel failed to render.
            </Text>
          </Box>
        )
      );
    }
    return this.props.children;
  }
}



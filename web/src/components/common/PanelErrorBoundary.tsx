import React from "react";
import { Text, FlexColumn, SPACING } from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";

interface PanelErrorBoundaryProps {
  fallback?: React.ReactNode;
  /** Names the panel in the report, so a maintainer knows what crashed. */
  panelName?: string;
  children: React.ReactNode;
}

interface PanelErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

// React error boundaries must be class components: getDerivedStateFromError and
// componentDidCatch have no functional-component equivalent.
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
    console.error("Panel crashed:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const panel = this.props.panelName ?? "Panel";
      return (
        this.props.fallback ?? (
          <FlexColumn
            align="center"
            justify="center"
            gap={SPACING.sm}
            sx={{
              padding: 3,
              minHeight: 200,
              bgcolor: "error.dark",
              color: "error.contrastText"
            }}
          >
            <Text size="small" component="div">
              {panel} failed to render.
            </Text>
            <ReportBugButton
              variant="outlined"
              label="Report a bug"
              context={{
                source: "panel-crash",
                summary: `${panel} failed to render`,
                errorText: this.state.error?.message,
                stackTrace: this.state.error?.stack
              }}
            />
          </FlexColumn>
        )
      );
    }
    return this.props.children;
  }
}

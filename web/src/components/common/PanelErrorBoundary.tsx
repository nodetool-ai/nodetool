import React from "react";

interface PanelErrorBoundaryProps {
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

interface PanelErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

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
      return this.props.fallback ?? (
        <div style={{ padding: 12, color: "var(--palette-error-main)" }}>
          Panel failed to render.
        </div>
      );
    }
    return this.props.children;
  }
}



import React, { Component, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface ErrorBoundaryProps {
  children: ReactNode;
  location: any;
  signout: () => Promise<void>;
}

interface PropsWithChildren {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class AuthErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: any) {
    console.log("getDerivedStateFromError", error);
    if (error.detail === "Unauthorized" || error.message === "Unauthorized") {
      return { hasError: true };
    }
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.log("AuthErrorBoundary", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      this.props.signout();
      return <></>;
    }

    return this.props.children;
  }
}

export default AuthErrorBoundary;

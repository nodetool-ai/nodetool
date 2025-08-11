import React from "react";
import "./index.css";
import { createRoot } from "react-dom/client";
import { App } from "./components/App";
import { ComponentTest } from "./components/ComponentTest";
import { Provider } from "./components/ui/provider";
import ChatInterface from "./components/ChatInterface";
import { Box } from "@chakra-ui/react";

// Add ErrorBoundary component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "2rem" }}>
          <h1 style={{ color: "#E53E3E", marginBottom: "1rem" }}>
            Something went wrong
          </h1>
          <pre style={{ whiteSpace: "pre-wrap", color: "#666" }}>
            {this.state.error?.message}
            {"\n\n"}
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const urlParams = new URLSearchParams(window.location.search);

const isTestPage = urlParams.get("test") === "true";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <Provider>
        <Box minH="100dvh">
          {isTestPage ? (
            <ComponentTest />
          ) : (
            <ChatInterface token="local_token" />
          )}
        </Box>
      </Provider>
    </ErrorBoundary>
  </React.StrictMode>
);

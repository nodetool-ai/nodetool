import React from "react";
import ReactDOM from "react-dom/client";
import reportWebVitals from "./reportWebVitals";
import { ReactFlowProvider } from "reactflow";

import {
  Navigate,
  RouterProvider,
  createBrowserRouter
} from "react-router-dom";

import NodeEditor from "./components/node_editor/NodeEditor";
import initiateEditor from "./core/initiateEditor";

import PanelLeft from "./components/panels/PanelLeft";
import PanelRight from "./components/panels/PanelRight";

import { ThemeProvider } from "@emotion/react";
import { CssBaseline } from "@mui/material";
import ThemeNodetool from "./components/themes/ThemeNodetool";
import ThemeNodes from "./components/themes/ThemeNodes";

import AppHeader from "./components/panels/AppHeader";
import "./styles/index.css";
import "./styles/microtip.css";
import "./styles/vars.css";
import NodeMenu from "./components/node_menu/NodeMenu";
import AssetExplorer from "./components/assets/AssetExplorer";
import WorkflowGrid from "./components/workflows/WorkflowGrid";
import ErrorBoundary from "./components/ErrorBoundary";
import { QueryClient, QueryClientProvider } from "react-query";
import { ReactQueryDevtools } from "react-query/devtools";
import { useAssetStore } from "./stores/AssetStore";
import { useWorkflowStore } from "./stores/WorkflowStore";
import { AuthProvider, useAuth } from "./providers/AuthProvider";
import Login from "./components/Login";
import AppFooter from "./components/panels/AppFooter";
import OAuthCallback from "./components/OauthCallback";
import ExampleGrid from "./components/workflows/ExampleGrid";
import OpenOrCreateDialog from "./components/dialogs/OpenOrCreateDialog";
import * as Sentry from "@sentry/react";

if (import.meta.env.MODE === "production") {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration()
    ],
    tracesSampleRate: 1.0,
    tracePropagationTargets: [/^https:\/\/app.nodetool\.ai/],
    replaysSessionSampleRate: 0.1, // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
    replaysOnErrorSampleRate: 1.0 // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
  });
}

const queryClient = new QueryClient();
useAssetStore.getState().setQueryClient(queryClient);
useWorkflowStore.getState().setQueryClient(queryClient);

const NavigateToStart = () => {
  const { user } = useAuth();
  if (user) {
    return <Navigate to={"/editor/start"} replace={true} />;
  } else {
    return <Navigate to={"/login"} replace={true} />;
  }
};

const router = createBrowserRouter([
  {
    path: "/",
    element: <NavigateToStart />
  },
  {
    path: "/oauth/callback",
    element: <OAuthCallback />
  },
  {
    path: "/editor",
    element: <NavigateToStart />
  },
  {
    path: "/login",
    element: (
      <ThemeProvider theme={ThemeNodetool}>
        <CssBaseline />
        <Login />
      </ThemeProvider>
    )
  },
  {
    path: "assets",
    element: (
      <ThemeProvider theme={ThemeNodetool}>
        <CssBaseline />
        <AppHeader />
        <AssetExplorer />
      </ThemeProvider>
    )
  },
  {
    path: "examples",
    element: (
      <ThemeProvider theme={ThemeNodetool}>
        <CssBaseline />
        <AppHeader />
        <ExampleGrid />
      </ThemeProvider>
    )
  },
  {
    path: "workflows",
    element: (
      <ThemeProvider theme={ThemeNodetool}>
        <CssBaseline />
        <AppHeader />
        <WorkflowGrid />
      </ThemeProvider>
    )
  },
  {
    path: "editor/:workflow",
    element: (
      <>
        <ThemeProvider theme={ThemeNodetool}>
          <CssBaseline />
          <AppHeader />
          <PanelLeft />
          <PanelRight />
          <AppFooter />
        </ThemeProvider>
        <ThemeProvider theme={ThemeNodes}>
          <NodeEditor />
        </ThemeProvider>
        <ThemeProvider theme={ThemeNodetool}>
          <CssBaseline />
          <NodeMenu focusSearchInput={true} />
        </ThemeProvider>
      </>
    ),
    loader: async ({ params }) => await initiateEditor(params.workflow)
  },
  {
    path: "editor/start",
    element: (
      <>
        <ThemeProvider theme={ThemeNodetool}>
          <CssBaseline />
          <AppHeader />
          <OpenOrCreateDialog />
        </ThemeProvider>
        <ThemeProvider theme={ThemeNodes}>
          <NodeEditor />
        </ThemeProvider>
      </>
    ),
    loader: async ({ params }) => await initiateEditor(params.workflow)
  }
]);

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <ReactFlowProvider>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
            <ReactQueryDevtools />
          </QueryClientProvider>
        </ReactFlowProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

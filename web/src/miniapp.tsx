/** @jsxImportSource @emotion/react */
// Minimal entry point for standalone mini apps
import type {} from "./theme";
import type {} from "./emotion";
import type {} from "./material-ui";

import React, { Suspense, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  Navigate,
  RouteObject,
  RouterProvider,
  createBrowserRouter
} from "react-router-dom";

import ErrorBoundary from "./ErrorBoundary";
import { CircularProgress } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import ThemeNodetool from "./components/themes/ThemeNodetool";
import { CssBaseline } from "@mui/material";

import "@xyflow/react/dist/style.css";
import "@xyflow/react/dist/base.css";
import "./styles/vars.css";
import "./styles/index.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queryClient";
import { useAssetStore } from "./stores/AssetStore";
import Login from "./components/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import useAuth from "./stores/useAuth";
import { isLocalhost } from "./stores/ApiClient";
import { loadMetadata } from "./serverState/useMetadata";
import {
  WorkflowManagerProvider
} from "./contexts/WorkflowManagerContext";
import { useModelDownloadStore } from "./stores/ModelDownloadStore";

// Lazy-loaded minimal mini app component
const StandaloneMiniApp = React.lazy(
  () => import("./components/miniapps/StandaloneMiniApp")
);

const NavigateToLogin = () => {
  const { state } = useAuth();

  if (isLocalhost) {
    return <Navigate to="/miniapp" replace={true} />;
  } else if (state === "init" || state === "loading") {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh"
        }}
      >
        <CircularProgress />
      </div>
    );
  } else if (state === "logged_in") {
    return <Navigate to="/miniapp" replace={true} />;
  } else if (state === "logged_out") {
    return <Navigate to="/login" replace={true} />;
  } else if (state === "error") {
    return <Navigate to="/login" replace={true} />;
  }
  return <div>Error!</div>;
};

function getRoutes() {
  const routes: RouteObject[] = [
    {
      path: "/",
      element: <NavigateToLogin />
    },
    {
      path: "/login",
      element: <Login />
    },
    {
      path: "/miniapp/:workflowId",
      element: (
        <ProtectedRoute>
          <StandaloneMiniApp />
        </ProtectedRoute>
      )
    },
    {
      path: "/miniapp",
      element: (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100vh",
            flexDirection: "column",
            gap: "1rem"
          }}
        >
          <div>Please provide a workflow ID in the URL</div>
          <div style={{ fontSize: "0.875rem", opacity: 0.7 }}>
            Example: /miniapp/[workflow-id]
          </div>
        </div>
      )
    }
  ];

  routes.forEach((route) => {
    route.ErrorBoundary = ErrorBoundary;
  });

  return routes;
}

useAssetStore.getState().setQueryClient(queryClient);
useModelDownloadStore.getState().setQueryClient(queryClient);
const router = createBrowserRouter(getRoutes());
const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

const MiniAppWrapper = () => {
  const [status, setStatus] = useState<string>("pending");

  useEffect(() => {
    loadMetadata()
      .then((data: string) => {
        setStatus(data);
      })
      .catch((error: Error) => {
        console.error("Failed to load metadata:", error);
        setStatus("error");
      });
  }, []);

  return (
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={ThemeNodetool} defaultMode="dark">
          <CssBaseline />
          <WorkflowManagerProvider queryClient={queryClient}>
            {status === "pending" && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  height: "100vh"
                }}
              >
                <CircularProgress />
              </div>
            )}
            {status === "error" && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  height: "100vh",
                  flexDirection: "column"
                }}
              >
                <div>Error loading application metadata.</div>
                <div>Please try refreshing the page.</div>
              </div>
            )}
            {status !== "pending" && status !== "error" && (
              <Suspense
                fallback={
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      height: "100vh",
                      width: "100%"
                    }}
                  >
                    <CircularProgress />
                  </div>
                }
              >
                <RouterProvider router={router} />
              </Suspense>
            )}
          </WorkflowManagerProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </React.StrictMode>
  );
};

const initialize = async () => {
  useAuth.getState().initialize();
  root.render(<MiniAppWrapper />);
};

initialize().catch(console.error);

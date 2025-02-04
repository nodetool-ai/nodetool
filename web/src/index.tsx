/** @jsxImportSource @emotion/react */
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { ReactFlowProvider, useStore } from "@xyflow/react";

import {
  LoaderFunctionArgs,
  Navigate,
  RouteObject,
  RouterProvider,
  createBrowserRouter,
  redirect
} from "react-router-dom";

import ErrorBoundary from "./ErrorBoundary";

import PanelLeft from "./components/panels/PanelLeft";

import { ThemeProvider } from "@emotion/react";
import { CircularProgress, CssBaseline } from "@mui/material";
import ThemeNodetool from "./components/themes/ThemeNodetool";
import ThemeNodes from "./components/themes/ThemeNodes";

import AppHeader from "./components/panels/AppHeader";
import "@xyflow/react/dist/style.css";
import "@xyflow/react/dist/base.css";
import "./styles/vars.css";
import "./styles/index.css";
import "./styles/microtip.css";
import "./styles/command_menu.css";
import NodeMenu from "./components/node_menu/NodeMenu";
import AssetExplorer from "./components/assets/AssetExplorer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAssetStore } from "./stores/AssetStore";
import Login from "./components/Login";
import OAuthCallback from "./components/OauthCallback";
import ExampleGrid from "./components/workflows/ExampleGrid";
import OpenOrCreateDialog from "./components/dialogs/OpenOrCreateDialog";
import ProtectedRoute from "./components/ProtectedRoute";
import useAuth from "./stores/useAuth";
import { isProduction, pingWorker, useRemoteAuth } from "./stores/ApiClient";
import { initKeyListeners } from "./stores/KeyPressedStore";
import useRemoteSettingsStore from "./stores/RemoteSettingStore";
import ModelsManager from "./components/hugging_face/ModelsManager";
import useModelStore from "./stores/ModelStore";
import { loadMetadata } from "./serverState/useMetadata";
import { NodeProvider } from "./contexts/NodeContext";
import TabsNodeEditor from "./components/editor/TabsNodeEditor";
import Welcome from "./components/content/Welcome/Welcome";
import { useSettingsStore } from "./stores/SettingsStore";
import {
  FetchCurrentWorkflow,
  useWorkflowManager,
  WorkflowManagerProvider
} from "./contexts/WorkflowManagerContext";
if (!isProduction) {
  useRemoteSettingsStore.getState().fetchSettings();
}

const NavigateToStart = () => {
  const { state } = useAuth();
  const showWelcomeOnStartup = useSettingsStore(
    (state) => state.settings.showWelcomeOnStartup
  );

  if (useRemoteAuth === false) {
    return showWelcomeOnStartup ? (
      <Navigate to="/welcome" replace={true} />
    ) : (
      <Navigate to="/editor/start" replace={true} />
    );
  } else if (state === "init") {
    return <div>Loading...</div>;
  } else if (state === "logged_in") {
    return showWelcomeOnStartup ? (
      <Navigate to="/welcome" replace={true} />
    ) : (
      <Navigate to="/editor/start" replace={true} />
    );
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
      element: <NavigateToStart />
    },
    {
      path: "/welcome",
      element: (
        <ThemeProvider theme={ThemeNodetool}>
          <CssBaseline />
          <Welcome />
        </ThemeProvider>
      )
    },
    {
      path: "/oauth/callback",
      element: <OAuthCallback />
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
      path: "/editor",
      element: <NavigateToStart />
    },
    {
      path: "assets",
      element: (
        <ProtectedRoute>
          <ThemeProvider theme={ThemeNodetool}>
            <CssBaseline />
            <AppHeader />
            <AssetExplorer />
          </ThemeProvider>
        </ProtectedRoute>
      )
    },
    {
      path: "examples",
      element: (
        <ProtectedRoute>
          <ThemeProvider theme={ThemeNodetool}>
            <CssBaseline />
            <AppHeader />
            <ExampleGrid />
          </ThemeProvider>
        </ProtectedRoute>
      )
    },
    {
      path: "models",
      element: (
        <ProtectedRoute>
          <ThemeProvider theme={ThemeNodetool}>
            <CssBaseline />
            <AppHeader />
            <ModelsManager />
          </ThemeProvider>
        </ProtectedRoute>
      )
    },
    {
      path: "editor/:workflow",
      element: (
        <ProtectedRoute>
          <FetchCurrentWorkflow>
            <ThemeProvider theme={ThemeNodetool}>
              <CssBaseline />
              <AppHeader />
            </ThemeProvider>
            <ThemeProvider theme={ThemeNodes}>
              <div
                style={{
                  display: "flex",
                  width: "100%",
                  height: "calc(100vh - 64px)"
                }}
              >
                <PanelLeft />
                <TabsNodeEditor />
              </div>
            </ThemeProvider>
          </FetchCurrentWorkflow>
        </ProtectedRoute>
      )
    },
    {
      path: "editor/start",
      element: (
        <ProtectedRoute>
          <ThemeProvider theme={ThemeNodetool}>
            <CssBaseline />
            <AppHeader />
            <OpenOrCreateDialog />
          </ThemeProvider>
        </ProtectedRoute>
      )
    }
  ];

  routes.forEach((route) => {
    route.ErrorBoundary = ErrorBoundary;
  });

  return routes;
}

const queryClient = new QueryClient();
useAssetStore.getState().setQueryClient(queryClient);
useModelStore.getState().setQueryClient(queryClient);

const showWelcomeOnStartup =
  useSettingsStore.getState().settings.showWelcomeOnStartup;

const router = createBrowserRouter(getRoutes());
const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

const AppWrapper = () => {
  const [status, setStatus] = useState<string>("pending");

  useEffect(() => {
    loadMetadata().then((data) => {
      setStatus(data);
    });
  }, []);

  if (status === "pending") {
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
  }

  if (status === "error") {
    return <div>Error loading metadata</div>;
  }

  return (
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <WorkflowManagerProvider>
          <RouterProvider router={router} />
        </WorkflowManagerProvider>
      </QueryClientProvider>
    </React.StrictMode>
  );
};

// We need to make the initialization async
const initialize = async () => {
  useAuth.getState().initialize();
  initKeyListeners();

  // Render after initialization and prefetching
  root.render(<AppWrapper />);
};

initialize().catch(console.error);

/** @jsxImportSource @emotion/react */

// Early polyfills / globals must come before other imports.
import "./prismGlobal";

import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

import {
  Navigate,
  RouteObject,
  RouterProvider,
  createBrowserRouter
} from "react-router-dom";

import ErrorBoundary from "./ErrorBoundary";

import PanelLeft from "./components/panels/PanelLeft";
import PanelRight from "./components/panels/PanelRight";
import { CircularProgress } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import ThemeNodetool from "./components/themes/ThemeNodetool";
import { CssBaseline } from "@mui/material";

import "@xyflow/react/dist/style.css";
import "@xyflow/react/dist/base.css";
import "./styles/vars.css";
import "./styles/index.css";
import "./styles/microtip.css";
import "./styles/command_menu.css";
import AssetExplorer from "./components/assets/AssetExplorer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAssetStore } from "./stores/AssetStore";
import Login from "./components/Login";
import ExampleGrid from "./components/workflows/ExampleGrid";
import OpenOrCreateDialog from "./components/dialogs/OpenOrCreateDialog";
import ProtectedRoute from "./components/ProtectedRoute";
import useAuth from "./stores/useAuth";
import { isLocalhost } from "./stores/ApiClient";
import { initKeyListeners } from "./stores/KeyPressedStore";
import useRemoteSettingsStore from "./stores/RemoteSettingStore";
import useModelStore from "./stores/ModelStore";
import { loadMetadata } from "./serverState/useMetadata";
import TabsNodeEditor from "./components/editor/TabsNodeEditor";
import Welcome from "./components/content/Welcome/Welcome";
import { useSettingsStore } from "./stores/SettingsStore";
import {
  FetchCurrentWorkflow,
  WorkflowManagerProvider,
  useWorkflowManager
} from "./contexts/WorkflowManagerContext";
import KeyboardProvider from "./components/KeyboardProvider";
import { MenuProvider } from "./providers/MenuProvider";
import ModelListIndex from "./components/hugging_face/model_list/ModelListIndex";
import DownloadManagerDialog from "./components/hugging_face/DownloadManagerDialog";
import { useModelDownloadStore } from "./stores/ModelDownloadStore";

import log from "loglevel";
import GlobalChat from "./components/chat/containers/GlobalChat";
// Dev-only component for UI testing
import LayoutTest from "./components/LayoutTest";
import Dashboard from "./components/dashboard/Dashboard";
import Alert from "./components/node_editor/Alert";

(window as any).log = log;

if (isLocalhost) {
  useRemoteSettingsStore.getState().fetchSettings().catch(console.error);
}

const NavigateToStart = () => {
  const { state } = useAuth();
  const showWelcomeOnStartup = useSettingsStore(
    (state) => state.settings.showWelcomeOnStartup
  );

  if (isLocalhost) {
    return showWelcomeOnStartup ? (
      <Navigate to="/welcome" replace={true} />
    ) : (
      <Navigate to="/dashboard" replace={true} />
    );
  } else if (state === "init") {
    return <div>Loading...</div>;
  } else if (state === "logged_in") {
    return <Navigate to="/dashboard" replace={true} />;
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
      path: "/dashboard",
      element: (
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      )
    },
    {
      path: "/welcome",
      element: <Welcome />
    },
    {
      path: "/login",
      element: <Login />
    },
    {
      path: "/chat/:thread_id?",
      element: (
        <ProtectedRoute>
          <PanelLeft />
          <GlobalChat />
        </ProtectedRoute>
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
          <AssetExplorer />
        </ProtectedRoute>
      )
    },
    {
      path: "examples",
      element: (
        <ProtectedRoute>
          <ExampleGrid />
        </ProtectedRoute>
      )
    },
    {
      path: "editor/:workflow",
      element: (
        <ProtectedRoute>
          <FetchCurrentWorkflow>
            <div
              style={{
                display: "flex",
                width: "100%",
                height: "100%"
              }}
            >
              <PanelLeft />
              <TabsNodeEditor />
              <PanelRight />
              <Alert />
            </div>
          </FetchCurrentWorkflow>
        </ProtectedRoute>
      )
    },
    {
      path: "models",
      element: (
        <ProtectedRoute>
          <ModelListIndex />
        </ProtectedRoute>
      )
    }
  ];

  // Add the LayoutTest page only in local development
  if (isLocalhost) {
    routes.push({
      path: "/layouttest",
      element: <LayoutTest />
    });
  }

  routes.forEach((route) => {
    route.ErrorBoundary = ErrorBoundary;
  });

  return routes;
}

const queryClient = new QueryClient();
useAssetStore.getState().setQueryClient(queryClient);
useModelStore.getState().setQueryClient(queryClient);
const router = createBrowserRouter(getRoutes());
const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

const AppWrapper = () => {
  const [status, setStatus] = useState<string>("pending");
  const { state } = useAuth();

  useEffect(() => {
    // Existing effect for loading metadata
    loadMetadata()
      .then((data) => {
        setStatus(data);
      })
      .catch((error) => {
        console.error("Failed to load metadata:", error);
        setStatus("error"); // Ensure status is set to error on promise rejection
      });
  }, []); // Empty dependency array ensures this runs only once on mount

  // Helper to navigate to the newly created workflow
  // This function seems unused in the current context of AppWrapper's return,
  // but keeping it in case it's used by other parts or intended for future use.
  const handleWorkflowCreated = (workflowId: string) => {
    window.location.href = `/editor/${workflowId}`;
  };

  return (
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={ThemeNodetool}>
          <CssBaseline />
          <MenuProvider>
            <WorkflowManagerProvider queryClient={queryClient}>
              <KeyboardProvider active={true}>
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
                {/* Render RouterProvider only when metadata is successfully loaded */}
                {status !== "pending" && status !== "error" && (
                  <>
                    <RouterProvider router={router} />
                    <DownloadManagerDialog />
                  </>
                )}
              </KeyboardProvider>
            </WorkflowManagerProvider>
          </MenuProvider>{" "}
        </ThemeProvider>
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

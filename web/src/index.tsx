/** @jsxImportSource @emotion/react */
// Ensure global MUI/Emotion type augmentations are loaded in the TS program
import type {} from "./theme";
import type {} from "./emotion";
import type {} from "./material-ui";
import type {} from "./window";
// import type {} from "./types/svg-react"; // removed: file does not exist

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
import { CircularProgress, useMediaQuery } from "@mui/material";
import { ThemeProvider, useTheme } from "@mui/material/styles";
import ThemeNodetool from "./components/themes/ThemeNodetool";
import { CssBaseline } from "@mui/material";

import "@xyflow/react/dist/style.css";
import "@xyflow/react/dist/base.css";
import "./styles/vars.css";
import "./styles/index.css";
import "./styles/microtip.css";
import "./styles/command_menu.css";
import "./styles/mobile.css";
import "dockview/dist/styles/dockview.css";
import "./styles/dockview.css";
import AssetExplorer from "./components/assets/AssetExplorer";
import CollectionsExplorer from "./components/collections/CollectionsExplorer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAssetStore } from "./stores/AssetStore";
import Login from "./components/Login";
import TemplateGrid from "./components/workflows/ExampleGrid";
import OpenOrCreateDialog from "./components/dialogs/OpenOrCreateDialog";
import ProtectedRoute from "./components/ProtectedRoute";
import useAuth from "./stores/useAuth";
import { isLocalhost } from "./stores/ApiClient";
import { initKeyListeners } from "./stores/KeyPressedStore";
import useRemoteSettingsStore from "./stores/RemoteSettingStore";
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
import MiniAppPage from "./components/miniapps/MiniAppPage";

import log from "loglevel";
import GlobalChat from "./components/chat/containers/GlobalChat";
// Dev-only component for UI testing
import LayoutTest from "./components/LayoutTest";
import Dashboard from "./components/dashboard/Dashboard";
import Alert from "./components/node_editor/Alert";
import MobileClassProvider from "./components/MobileClassProvider";
import AppHeader from "./components/panels/AppHeader";

// Register frontend tools
import "./lib/tools/builtin/addNode";
import "./lib/tools/builtin/setSelectionMode";
import "./lib/tools/builtin/setAutoLayout";
import "./lib/tools/builtin/setNodeSyncMode";
import "./lib/tools/builtin/connectNodes";
import "./lib/tools/builtin/deleteNode";
import "./lib/tools/builtin/deleteEdge";
import "./lib/tools/builtin/updateNodeData";
import "./lib/tools/builtin/moveNode";
import "./lib/tools/builtin/autoLayout";
import "./lib/tools/builtin/setNodeTitle";
import "./lib/tools/builtin/setNodeColor";
import "./lib/tools/builtin/alignNodes";
import "./lib/tools/builtin/duplicateNode";
import "./lib/tools/builtin/selectNodes";
import "./lib/tools/builtin/fitView";
import { useModelDownloadStore } from "./stores/ModelDownloadStore";

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
          <PanelLeft />
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
          <>
            {/* Fixed application header at the very top */}
            <AppHeader />
            {/* Main chat area beneath the header */}
            <div
              style={{
                display: "flex",
                width: "100%",
                height: "100%"
              }}
            >
              <PanelLeft />
              <GlobalChat />
            </div>
          </>
        </ProtectedRoute>
      )
    },
    {
      path: "/apps/:workflowId?",
      element: (
        <ProtectedRoute>
          <>
            <AppHeader />
            <div
              style={{
                display: "flex",
                width: "100%",
                height: "100%"
              }}
            >
              <PanelLeft />
              <div style={{ flex: 1, display: "flex" }}>
                <MiniAppPage />
              </div>
            </div>
          </>
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
          <PanelLeft />
          <AssetExplorer />
        </ProtectedRoute>
      )
    },
    {
      path: "collections",
      element: (
        <ProtectedRoute>
          <CollectionsExplorer />
        </ProtectedRoute>
      )
    },
    {
      path: "templates",
      element: (
        <ProtectedRoute>
          <PanelLeft />
          <TemplateGrid />
        </ProtectedRoute>
      )
    },
    {
      path: "editor/:workflow",
      element: (
        <ProtectedRoute>
          <FetchCurrentWorkflow>
            <>
              {/* Fixed application header at the very top */}
              <AppHeader />
              {/* Main editor area beneath the header */}
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
            </>
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
useModelDownloadStore.getState().setQueryClient(queryClient);
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

  return (
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={ThemeNodetool} defaultMode="dark">
          <CssBaseline />
          <MobileClassProvider>
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
            </MenuProvider>
          </MobileClassProvider>
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

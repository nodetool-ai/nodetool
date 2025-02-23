/** @jsxImportSource @emotion/react */
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

import { ThemeProvider } from "@emotion/react";
import { CircularProgress, CssBaseline } from "@mui/material";
import ThemeNodetool from "./components/themes/ThemeNodetool";

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
import OAuthCallback from "./components/OauthCallback";
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
  WorkflowManagerProvider
} from "./contexts/WorkflowManagerContext";
import KeyboardProvider from "./components/KeyboardProvider";
import HuggingFaceDownloadDialog from "./components/hugging_face/HuggingFaceDownloadDialog";
import { MenuProvider } from "./providers/MenuProvider";

if (isLocalhost) {
  useRemoteSettingsStore.getState().fetchSettings();
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
      <Navigate to="/editor/start" replace={true} />
    );
  } else if (state === "init") {
    return <div>Loading...</div>;
  } else if (state === "logged_in") {
    return <Navigate to="/editor/start" replace={true} />;
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
      element: <Welcome />
    },
    {
      path: "/oauth/callback",
      element: <OAuthCallback />
    },
    {
      path: "/login",
      element: <Login />
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
            </div>
          </FetchCurrentWorkflow>
        </ProtectedRoute>
      )
    },
    {
      path: "editor/start",
      element: (
        <ProtectedRoute>
          <OpenOrCreateDialog />
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
        <ThemeProvider theme={ThemeNodetool}>
          <CssBaseline />
          <MenuProvider>
            <WorkflowManagerProvider queryClient={queryClient}>
              <KeyboardProvider active={true}>
                <RouterProvider router={router} />
                <HuggingFaceDownloadDialog />
              </KeyboardProvider>
            </WorkflowManagerProvider>
          </MenuProvider>
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

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
import { useWorkflowStore } from "./stores/WorkflowStore";
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
import { NodeProvider, useWorkflows } from "./contexts/NodeContext";
import TabsNodeEditor from "./components/editor/TabsNodeEditor";
if (!isProduction) {
  useRemoteSettingsStore.getState().fetchSettings();
}

const NavigateToStart = () => {
  const { state } = useAuth();
  if (useRemoteAuth === false) {
    return <Navigate to={"/editor/start"} replace={true} />;
  } else if (state === "init") {
    return <div>Loading...</div>;
  } else if (state === "logged_in") {
    return <Navigate to={"/editor/start"} replace={true} />;
  } else if (state === "logged_out") {
    return <Navigate to={"/login"} replace={true} />;
  } else if (state === "error") {
    return <Navigate to={"/login"} replace={true} />;
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
            <AppHeader showActions={false} />
            <PanelLeft />
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
            <AppHeader showActions={false} />
            <PanelLeft />
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
            <AppHeader showActions={false} />
            <PanelLeft />
            <ModelsManager />
          </ThemeProvider>
        </ProtectedRoute>
      )
    },
    {
      path: "editor/:workflow",
      element: (
        <ProtectedRoute>
          <NodeProvider>
            <ThemeProvider theme={ThemeNodetool}>
              <CssBaseline />
              <AppHeader showActions={true} />
              <PanelLeft />
            </ThemeProvider>
            <ThemeProvider theme={ThemeNodes}>
              <TabsNodeEditor />
            </ThemeProvider>
            <ThemeProvider theme={ThemeNodetool}>
              <CssBaseline />
              <NodeMenu focusSearchInput={true} showNamespaceTree={false} />
            </ThemeProvider>
          </NodeProvider>
        </ProtectedRoute>
      ),
      loader: async ({ params }: LoaderFunctionArgs) => {
        const getWorkflow = useWorkflowStore.getState().get;
        if (!params.workflow) {
          return redirect("/editor/start");
        }
        return { workflow: await getWorkflow(params.workflow) };
      }
    },
    {
      path: "editor/start",
      element: (
        <ProtectedRoute>
          <ThemeProvider theme={ThemeNodetool}>
            <CssBaseline />
            <AppHeader showActions={false} />
            <PanelLeft />
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
useWorkflowStore.getState().setQueryClient(queryClient);
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
      <ReactFlowProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ReactFlowProvider>
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

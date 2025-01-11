import React from "react";
import ReactDOM from "react-dom/client";
import { ReactFlowProvider, useStore } from "@xyflow/react";

import {
  LoaderFunctionArgs,
  Navigate,
  RouteObject,
  RouterProvider,
  createBrowserRouter
} from "react-router-dom";

import ErrorBoundary from "./ErrorBoundary";

import NodeEditor from "./components/node_editor/NodeEditor";
import initiateEditor from "./core/initiateEditor";

import PanelLeft from "./components/panels/PanelLeft";

import { ThemeProvider } from "@emotion/react";
import { CssBaseline } from "@mui/material";
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
import { MIN_ZOOM } from "./config/constants";
import { metadataQuery } from "./serverState/useMetadata";
import useMetadataStore from "./stores/MetadataStore";
import { useNodeStore } from "./stores/NodeStore";
import { getStoredPanelSizes } from "./hooks/handlers/useResizePanel";
import { usePanelStore } from "./stores/PanelStore";
import { createConnectabilityMatrix } from "./components/node_menu/typeFilterUtils";

if (!isProduction) {
  useRemoteSettingsStore.getState().fetchSettings();
}

usePanelStore.getState().initializePanelSizes(getStoredPanelSizes());

const queryClient = new QueryClient();
useAssetStore.getState().setQueryClient(queryClient);
useWorkflowStore.getState().setQueryClient(queryClient);
useModelStore.getState().setQueryClient(queryClient);

metadataQuery()
  .then((metadata) => {
    queryClient.setQueryData(["metadata"], metadata);
    useMetadataStore.getState().setMetadata(metadata.metadataByType);
    createConnectabilityMatrix(Object.values(metadata.metadataByType));
    useNodeStore.getState().startAutoSave();
  })
  .catch((error) => {
    console.error("Failed to fetch metadata:", error);
  });

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

const NodeEditorWrapper = () => {
  const currentZoom = useStore((state) => state.transform[2]);
  const isMinZoom = currentZoom <= MIN_ZOOM;
  return <NodeEditor isMinZoom={isMinZoom} />;
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
            <AppHeader />
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
            <AppHeader />
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
          <ThemeProvider theme={ThemeNodetool}>
            <CssBaseline />
            <AppHeader />
            <PanelLeft />
            {/* <AppFooter /> */}
          </ThemeProvider>
          <ThemeProvider theme={ThemeNodes}>
            <NodeEditorWrapper />
          </ThemeProvider>
          <ThemeProvider theme={ThemeNodetool}>
            <CssBaseline />
            <NodeMenu focusSearchInput={true} />
          </ThemeProvider>
        </ProtectedRoute>
      ),
      loader: async ({ params }: LoaderFunctionArgs) =>
        await initiateEditor(params.workflow)
    },
    {
      path: "editor/start",
      element: (
        <ProtectedRoute>
          <ThemeProvider theme={ThemeNodetool}>
            <CssBaseline />
            <AppHeader />
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

const router = createBrowserRouter(getRoutes());
const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

useAuth.getState().initialize();
initKeyListeners();

root.render(
  <React.StrictMode>
    <ReactFlowProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ReactFlowProvider>
  </React.StrictMode>
);

import React from "react";
import ReactDOM from "react-dom/client";
import reportWebVitals from "./reportWebVitals";
import { ReactFlowProvider, useStore } from "@xyflow/react";

import {
  LoaderFunctionArgs,
  Navigate,
  RouterProvider,
  createBrowserRouter
} from "react-router-dom";

import ErrorBoundary from "./ErrorBoundary";

import NodeEditor from "./components/node_editor/NodeEditor";
import initiateEditor from "./core/initiateEditor";

import PanelLeft from "./components/panels/PanelLeft";
import PanelRight from "./components/panels/PanelRight";

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
import WorkflowGrid from "./components/workflows/WorkflowGrid";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAssetStore } from "./stores/AssetStore";
import { useWorkflowStore } from "./stores/WorkflowStore";
import Login from "./components/Login";
import OAuthCallback from "./components/OauthCallback";
import ExampleGrid from "./components/workflows/ExampleGrid";
import OpenOrCreateDialog from "./components/dialogs/OpenOrCreateDialog";
import ProtectedRoute from "./components/ProtectedRoute";
import { initSentry } from "./utils/sentry";
import { RouteObject } from "@sentry/react/types/types";
import useAuth from "./stores/useAuth";
import { isProduction, pingWorker, useRemoteAuth } from "./stores/ApiClient";
import { initKeyListeners } from "./stores/KeyPressedStore";
import useRemoteSettingsStore from "./stores/RemoteSettingStore";
import ModelsManager from "./components/hugging_face/ModelsManager";
import useModelStore from "./stores/ModelStore";
import NodeDocumentation from "./components/content/Help/NodeDocumentation";
import { MIN_ZOOM } from "./config/constants";
import { metadataQuery } from "./serverState/useMetadata";
import useMetadataStore from "./stores/MetadataStore";
import NodeMenuStore from "./stores/NodeMenuStore";

initSentry();

pingWorker();

if (!isProduction) {
  useRemoteSettingsStore.getState().fetchSettings();
}

const queryClient = new QueryClient();
useAssetStore.getState().setQueryClient(queryClient);
useWorkflowStore.getState().setQueryClient(queryClient);
useModelStore.getState().setQueryClient(queryClient);

const metadata = await metadataQuery();
queryClient.setQueryData(["metadata"], metadata);
useMetadataStore.getState().setMetadata(metadata.metadataByType);

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
  // const isMaxZoom = currentZoom === MAX_ZOOM;
  const isMinZoom = currentZoom === MIN_ZOOM;

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
      path: "workflows",
      element: (
        <ProtectedRoute>
          <ThemeProvider theme={ThemeNodetool}>
            <CssBaseline />
            <AppHeader />
            <WorkflowGrid />
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
            <PanelRight />
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
            <OpenOrCreateDialog />
          </ThemeProvider>
        </ProtectedRoute>
      )
    },
    {
      path: "help/:nodeType",
      element: (
        <ThemeProvider theme={ThemeNodetool}>
          <CssBaseline />
          <AppHeader />
          <NodeDocumentation />
        </ThemeProvider>
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

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

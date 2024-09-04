import React from "react";
import ReactDOM from "react-dom/client";
import reportWebVitals from "./reportWebVitals";
import { ReactFlowProvider } from "reactflow";

import {
  LoaderFunctionArgs,
  Navigate,
  RouterProvider,
  createBrowserRouter,
  useRouteError
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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
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
import { isProduction, pingWorker } from "./stores/ApiClient";
import { initKeyListeners } from "./stores/KeyPressedStore";
import useRemoteSettingsStore from "./stores/RemoteSettingStore";
import ModelsManager from "./components/hugging_face/ModelsManager";

initSentry();

pingWorker();

if (!isProduction) {
  useRemoteSettingsStore.getState().fetchSettings();
}

const queryClient = new QueryClient();
useAssetStore.getState().setQueryClient(queryClient);
useWorkflowStore.getState().setQueryClient(queryClient);

const NavigateToStart = () => {
  const { getUser } = useAuth();
  if (getUser()) {
    return <Navigate to={"/editor/start"} replace={true} />;
  } else {
    return <Navigate to={"/login"} replace={true} />;
  }
};

function ErrorBoundary() {
  const error = useRouteError();
  console.error(error);
  return <div>Error!</div>;
}

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
            <NodeEditor />
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
          <ThemeProvider theme={ThemeNodes}>
            <NodeEditor />
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
        <ReactQueryDevtools />
      </QueryClientProvider>
    </ReactFlowProvider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

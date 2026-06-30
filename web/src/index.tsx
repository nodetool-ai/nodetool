/** @jsxImportSource @emotion/react */
// Ensure global MUI/Emotion type augmentations are loaded in the TS program
import type {} from "./theme";
import type {} from "./emotion";
import type {} from "./material-ui";
import type {} from "./window";

// Early polyfills / globals must come before other imports.
import "./prismGlobal";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMenuHandler } from "./hooks/useIpcRenderer";
import type { MenuEventData } from "./window";
import ReactDOM from "react-dom/client";

import {
  Navigate,
  RouteObject,
  RouterProvider,
  createBrowserRouter
} from "react-router-dom";

import ErrorBoundary from "./ErrorBoundary";

// Lazy-load panel components to reduce initial bundle size
const PanelLeft = React.lazy(() => import("./components/panels/PanelLeft"));
const PanelBottom = React.lazy(() => import("./components/panels/PanelBottom"));
import { LoadingSpinner } from "./components/ui_primitives";
import { ThemeProvider } from "@mui/material/styles";
import InitColorSchemeScript from "@mui/system/InitColorSchemeScript";
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
import "./lib/dragdrop/dragdrop.css";
import { queryClient } from "./queryClient";
import { TRPCProvider } from "./trpc/Provider";
import { useAssetStore } from "./stores/AssetStore";
import Login from "./components/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import useAuth from "./stores/useAuth";
import { isLocalhost } from "./lib/env";
import { initKeyListeners } from "./stores/KeyPressedStore";
import useRemoteSettingsStore from "./stores/RemoteSettingStore";
import { loadMetadata } from "./serverState/useMetadata";
import { WorkflowManagerProvider } from "./contexts/WorkflowManagerContext";
import KeyboardProvider from "./components/KeyboardProvider";
import { MenuProvider } from "./providers/MenuProvider";
const DownloadManagerDialog = React.lazy(
  () => import("./components/hugging_face/DownloadManagerDialog")
);
const RunWarningDialog = React.lazy(
  () => import("./components/dialogs/RunWarningDialog")
);
const SearchProviderSetupDialog = React.lazy(
  () => import("./components/dialogs/SearchProviderSetupDialog")
);

import { installIpcLogBridge } from "./logging/ipcLogBridge";
import MobileClassProvider from "./components/MobileClassProvider";
import { SkipLinks } from "./components/ui_primitives";

import ChatComposerLayout from "./components/chat/containers/ChatComposerLayout";

// Lazy-loaded route components for code splitting
const GlobalChat = React.lazy(
  () => import("./components/chat/containers/GlobalChat")
);
const StandaloneMiniApp = React.lazy(
  () => import("./components/miniapps/StandaloneMiniApp")
);
const AppBuilderPage = React.lazy(
  () => import("./components/appbuilder/AppBuilderPage")
);
const ModelsPage = React.lazy(
  () => import("./components/hugging_face/model_list/ModelsPage")
);
const WorkspacesPage = React.lazy(
  () => import("./components/workspaces/WorkspacesPage")
);
const PackagesPage = React.lazy(
  () => import("./components/packages/PackagesPage")
);
const WorkflowGraphView = React.lazy(
  () => import("./components/graph_view/WorkflowGraphView")
);
const AssetExplorer = React.lazy(
  () => import("./components/assets/AssetExplorer")
);
const CollectionsExplorer = React.lazy(
  () => import("./components/collections/CollectionsExplorer")
);
const ExamplesPage = React.lazy(
  () => import("./components/portal/ExamplesPage")
);
const TutorialsPage = React.lazy(
  () => import("./components/tutorials/TutorialsPage")
);
const ChainEditorPage = React.lazy(
  () => import("./components/chain_editor/ChainEditorPage")
);
const Portal = React.lazy(() => import("./components/portal/Portal"));
const CostsDashboard = React.lazy(
  () => import("./components/costs/CostsDashboard")
);
const LayoutTest = React.lazy(() => import("./components/LayoutTest"));
const ChatMarkdownTest = React.lazy(
  () => import("./components/ChatMarkdownTest")
);
const CodeEditorDebug = React.lazy(
  () => import("./components/CodeEditorDebug")
);
const ComponentPreview = React.lazy(
  () => import("./components/preview/ComponentPreview")
);
const SettingsPage = React.lazy(
  () => import("./components/menus/SettingsMenu")
);
const TimelineEditor = React.lazy(
  () => import("./components/timeline/TimelineEditor")
);
const SketchEditorPage = React.lazy(
  () => import("./components/sketch/SketchEditorPage")
);
const WorkspaceShell = React.lazy(
  () => import("./components/workspace/WorkspaceShell")
);
import {
  WorkflowEditorRedirect,
  WorkflowAppRedirect
} from "./components/workspace/RouteRedirects";

// Defer frontend tool registrations until after initial render
const registerFrontendTools = () => {
  Promise.all([
    import("./lib/tools/builtin/addNode"),
    import("./lib/tools/builtin/connectNodes"),
    import("./lib/tools/builtin/updateNodeData"),
    import("./lib/tools/builtin/moveNode"),
    import("./lib/tools/builtin/setNodeTitle"),
    import("./lib/tools/builtin/graph"),
    import("./lib/tools/builtin/getGraph"),
    import("./lib/tools/builtin/searchNodes"),
    import("./lib/tools/builtin/searchModels"),
    import("./lib/tools/builtin/deleteNode"),
    import("./lib/tools/builtin/deleteEdge"),
    import("./lib/tools/builtin/model3d"),
    import("./lib/tools/builtin/timeline")
  ]).catch((error) => {
    console.error("Failed to register frontend tools:", error);
  });
};
import { useModelDownloadStore } from "./stores/ModelDownloadStore";

import { BORDER_RADIUS, SPACING, getSpacingPx } from "./components/ui_primitives";
installIpcLogBridge();

if (isLocalhost) {
  useRemoteSettingsStore
    .getState()
    .fetchSettings()
    .catch((err) => console.error(err));
}

const NavigateToStart = () => {
  const state = useAuth((auth) => auth.state);
  const navigate = useNavigate();

  // The tabbed workspace is the app entry point. Previously-open workflows are
  // restored as tabs from localStorage by the WorkspaceTabsStore.
  useEffect(() => {
    if (state === "init") {
      return;
    }
    if (isLocalhost || state === "logged_in") {
      navigate("/workspace", { replace: true });
    } else if (state === "logged_out" || state === "error") {
      navigate("/login", { replace: true });
    }
  }, [state, navigate]);

  return null;
};

function getRoutes() {
  const routes: RouteObject[] = [
    {
      path: "/",
      element: <NavigateToStart />
    },
    {
      element: <ChatComposerLayout />,
      children: [
        {
          path: "/dashboard",
          element: (
            <ProtectedRoute>
              <Portal />
            </ProtectedRoute>
          )
        },
        {
          path: "/chat/:thread_id?",
          element: (
            <ProtectedRoute>
              <div
                className="page-enter"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  width: "100%",
                  height: "100%"
                }}
              >
                <SkipLinks />
                {/* No header on chat — GlobalChat has its own
                    "Back to editor" control. */}
                <div
                  id="main-content"
                  style={{
                    display: "flex",
                    width: "100%",
                    height: "100%"
                  }}
                >
                  <PanelLeft />
                  <GlobalChat />
                  <PanelBottom />
                </div>
              </div>
            </ProtectedRoute>
          )
        }
      ]
    },
    {
      // Legacy route — the getting-started checklist now lives in the
      // chat homepage's empty state. Redirect old links there.
      path: "/welcome",
      element: <Navigate to="/chat" replace />
    },
    {
      path: "/settings",
      element: (
        <ProtectedRoute>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              height: "100%"
            }}
          >
            <SettingsPage />
          </div>
        </ProtectedRoute>
      )
    },
    {
      path: "/costs",
      element: (
        <ProtectedRoute>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              height: "100%"
            }}
          >
            <React.Suspense fallback={<LoadingSpinner />}>
              <CostsDashboard />
            </React.Suspense>
          </div>
        </ProtectedRoute>
      )
    },
    {
      path: "/login",
      element: <Login />
    },
    {
      path: "/apps/:workflowId?",
      element: (
        <ProtectedRoute>
          <WorkflowAppRedirect />
        </ProtectedRoute>
      )
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
      path: "/app-builder/:workflowId",
      element: (
        <ProtectedRoute>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              height: "100%"
            }}
          >
            <React.Suspense fallback={<LoadingSpinner />}>
              <AppBuilderPage />
            </React.Suspense>
          </div>
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
      path: "collections",
      element: (
        <ProtectedRoute>
          <CollectionsExplorer />
        </ProtectedRoute>
      )
    },
    {
      path: "examples",
      element: (
        <ProtectedRoute>
          <ExamplesPage />
        </ProtectedRoute>
      )
    },
    {
      path: "tutorials",
      element: (
        <ProtectedRoute>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              height: "100%"
            }}
          >
            <React.Suspense fallback={<LoadingSpinner />}>
              <TutorialsPage />
            </React.Suspense>
          </div>
        </ProtectedRoute>
      )
    },
    {
      path: "editor/:workflow",
      element: (
        <ProtectedRoute>
          <WorkflowEditorRedirect />
        </ProtectedRoute>
      )
    },
    {
      path: "models",
      element: (
        <ProtectedRoute>
          <ModelsPage />
        </ProtectedRoute>
      )
    },
    {
      path: "packages",
      element: (
        <ProtectedRoute>
          <PackagesPage />
        </ProtectedRoute>
      )
    },
    {
      path: "workspaces",
      element: (
        <ProtectedRoute>
          <WorkspacesPage />
        </ProtectedRoute>
      )
    },
    {
      path: "graph/:workflowId",
      element: <WorkflowGraphView />
    },
    {
      path: "chain/:workflowId?",
      element: (
        <ProtectedRoute>
          <div
            className="page-enter"
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              height: "100%"
            }}
          >
            <SkipLinks />
            <ChainEditorPage />
          </div>
        </ProtectedRoute>
      )
    },
    {
      path: "/timeline/:sequenceId",
      element: (
        <ProtectedRoute>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              height: "100%"
            }}
          >
            <SkipLinks />
            <React.Suspense fallback={<LoadingSpinner />}>
              <TimelineEditor />
            </React.Suspense>
          </div>
        </ProtectedRoute>
      )
    },
    {
      path: "/sketch/:documentId",
      element: (
        <ProtectedRoute>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              height: "100%"
            }}
          >
            <SkipLinks />
            <React.Suspense fallback={<LoadingSpinner />}>
              <SketchEditorPage />
            </React.Suspense>
          </div>
        </ProtectedRoute>
      )
    },
    {
      // New tabbed-document workspace (in progress). Lives alongside the
      // existing routes; will become the default once all document types
      // are wired. See docs/superpowers/specs/2026-05-30-tabbed-workspace-modes-design.md
      path: "/workspace",
      element: (
        <ProtectedRoute>
          <div
            className="page-enter"
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              height: "100%"
            }}
          >
            <SkipLinks />
            <React.Suspense fallback={<LoadingSpinner />}>
              <WorkspaceShell />
            </React.Suspense>
          </div>
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
    routes.push({
      path: "/chatmarkdowntest",
      element: <ChatMarkdownTest />
    });
    routes.push({
      path: "/code-editor-debug",
      element: <CodeEditorDebug />
    });
    // Component preview routes for isolated documentation screenshots
    routes.push({
      path: "/preview/:component?",
      element: <ComponentPreview />
    });
  }

  routes.forEach((route) => {
    route.ErrorBoundary = ErrorBoundary;
  });

  return routes satisfies RouteObject[];
}

useAssetStore.getState().setQueryClient(queryClient);
useModelDownloadStore.getState().setQueryClient(queryClient);

// Handle hash route for packaged Electron apps
// When loading index.html#/path, convert hash to regular route
const handleHashRoute = () => {
  const hash = window.location.hash;
  if (hash && hash.startsWith("#/")) {
    // Convert hash route to regular route
    // e.g., #/miniapp/workflowId -> /miniapp/workflowId
    const route = hash.slice(1); // Remove the leading #
    window.history.replaceState(null, "", route);
  }
};
handleHashRoute();

const router = createBrowserRouter(getRoutes());
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root not found");
const root = ReactDOM.createRoot(rootElement);

/**
 * Routes Electron menu/tray "Settings" actions to the in-app settings page.
 * The desktop shell sends an `openSettings` menu event (instead of opening a
 * separate window); navigating via the router singleton works from any route.
 */
const MenuNavigationBridge = () => {
  const handleMenuEvent = useCallback((data: MenuEventData) => {
    if (data.type === "openSettings") {
      void router.navigate("/settings");
    }
  }, []);
  useMenuHandler(handleMenuEvent);
  return null;
};

const AppWrapper = () => {
  const [status, setStatus] = useState<string>("pending");
  const authState = useAuth((s) => s.state);

  // Allow dev-only test pages to render without backend metadata
  const isDevTestRoute =
    isLocalhost &&
    ["/layouttest", "/chatmarkdowntest", "/graph", "/preview"].some((p) =>
      window.location.pathname.startsWith(p)
    );

  useEffect(() => {
    // Register frontend tools after initial render
    registerFrontendTools();
  }, []);

  useEffect(() => {
    // In production mode, wait until user is logged in before fetching metadata.
    // When logged out, skip metadata so the router can render and redirect to /login.
    if (!isLocalhost && authState !== "logged_in") {
      if (authState === "logged_out" || authState === "error") {
        setStatus("logged_out");
      }
      return;
    }

    loadMetadata()
      .then((data) => {
        setStatus(data);
      })
      .catch((error) => {
        console.error("Failed to load metadata:", error);
        setStatus("error");
      });
  }, [authState]);

  const shouldRenderRouter =
    isDevTestRoute || status === "success" || status === "logged_out";

  return (
    <React.StrictMode>
      <TRPCProvider>
        <InitColorSchemeScript attribute="class" defaultMode="dark" />
        <ThemeProvider theme={ThemeNodetool} defaultMode="dark">
          <CssBaseline />
          <MobileClassProvider>
            <MenuProvider>
              <MenuNavigationBridge />
              <WorkflowManagerProvider queryClient={queryClient}>
                <KeyboardProvider active={true}>
                  {status === "pending" && !isDevTestRoute && (
                    <div
                      role="status"
                      aria-label="Loading NodeTool"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        alignItems: "center",
                        height: "100vh",
                        gap: getSpacingPx(SPACING.xl)
                      }}
                    >
                      <LoadingSpinner size="large" />
                      <span
                        style={{
                          color: "var(--palette-text-secondary)",
                          fontSize: "var(--fontSizeNormal)"
                        }}
                      >
                        Loading NodeTool…
                      </span>
                    </div>
                  )}
                  {status === "error" && !isDevTestRoute && (
                    <div
                      role="alert"
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        height: "100vh",
                        flexDirection: "column",
                        gap: getSpacingPx(SPACING.lg)
                      }}
                    >
                      <span
                        style={{
                          color: "var(--palette-text-primary)",
                          fontSize: "var(--fontSizeNormal)"
                        }}
                      >
                        Error loading application metadata.
                      </span>
                      <button
                        type="button"
                        onClick={() => window.location.reload()}
                        style={{
                          padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xl)}`,
                          borderRadius: BORDER_RADIUS.md,
                          border: "1px solid var(--palette-divider)",
                          backgroundColor: "transparent",
                          color: "var(--palette-text-primary)",
                          cursor: "pointer",
                          fontSize: "var(--fontSizeNormal)"
                        }}
                      >
                        Refresh Page
                      </button>
                    </div>
                  )}
                  {/* Render RouterProvider only when metadata is successfully loaded */}
                  {shouldRenderRouter && (
                    <>
                      <Suspense
                        fallback={
                          <div
                            role="status"
                            aria-label="Loading"
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "center",
                              alignItems: "center",
                              height: "100vh",
                              width: "100%",
                              gap: getSpacingPx(SPACING.xl)
                            }}
                          >
                            <LoadingSpinner size="large" />
                            <span
                              style={{
                                color: "var(--palette-text-secondary)",
                                fontSize: "var(--fontSizeNormal)"
                              }}
                            >
                              Preparing workspace…
                            </span>
                          </div>
                        }
                      >
                        <RouterProvider router={router} />
                      </Suspense>
                      <DownloadManagerDialog />
                      <RunWarningDialog />
                      <SearchProviderSetupDialog />
                    </>
                  )}
                </KeyboardProvider>
              </WorkflowManagerProvider>
            </MenuProvider>
          </MobileClassProvider>
        </ThemeProvider>
      </TRPCProvider>
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

initialize().catch((err) => console.error(err));

/** @jsxImportSource @emotion/react */
// Ensure global MUI/Emotion type augmentations are loaded in the TS program
import type {} from "./theme";
import type {} from "./emotion";
import type {} from "./material-ui";
import type {} from "./window";

// Early polyfills / globals must come before other imports.
import "./cryptoUUIDPolyfill";
// `prismGlobal` (Prism core + 13 grammars) is NOT imported here: nothing on the
// boot path highlights code. Every consumer — CodeBlock, CodeHighlightPlugin,
// JSONRenderer, ToolCallRenderer — imports Prism and the grammars it needs
// itself, and all of them are behind a lazy chunk.
// Auto-reload when a lazy chunk 404s after a deploy (stale-asset recovery).
import "./lib/preloadErrorReload";

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

import { LoadingSpinner, ThemeRoot } from "./components/ui_primitives";
import ThemeNodetool from "./components/themes/ThemeNodetool";

import "@xyflow/react/dist/style.css";
import "@xyflow/react/dist/base.css";
import "./styles/vars.css";
import "./styles/index.css";
import "./styles/microtip.css";
import "./styles/command_menu.css";
import "./styles/mobile.css";
import "./lib/dragdrop/dragdrop.css";
import { queryClient } from "./queryClient";
import { TRPCProvider } from "./trpc/Provider";
import { useAssetStore } from "./stores/AssetStore";
import Login from "./components/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import useAuth from "./stores/useAuth";
import { isLocalhost } from "./lib/env";
import { loadRuntimeConfig, isAuthRequired } from "./lib/runtimeConfig";
import { initAnalytics } from "./lib/analytics";
import { initSupabaseFromConfig } from "./lib/supabaseClient";
import { initKeyListeners } from "./stores/KeyPressedStore";
import { useSettingsStore } from "./stores/SettingsStore";
import useRemoteSettingsStore from "./stores/RemoteSettingStore";
import { loadMetadata, prefetchMetadata } from "./serverState/useMetadata";
import { useCustomNodeMetadata } from "./serverState/useCustomNodeMetadata";
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
const ProviderOnboardingDialog = React.lazy(
  () => import("./components/provider_onboarding/ProviderOnboardingDialog")
);
import BugReportDialogHost from "./components/support/BugReportDialogHost";
import ReportBugButton from "./components/support/ReportBugButton";
import { installConsoleCapture } from "./utils/consoleCapture";

import { installIpcLogBridge } from "./logging/ipcLogBridge";
import MobileClassProvider from "./components/MobileClassProvider";
import { registerAppRouter } from "./lib/appNavigation";
import { SkipLinks } from "./components/ui_primitives";

// Lazy-loaded route components for code splitting
const AcceptSharePage = React.lazy(
  () => import("./components/workflows/AcceptSharePage")
);
const IntegrationLinkPage = React.lazy(
  () => import("./components/settings/IntegrationLinkPage")
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
const CostsDashboard = React.lazy(
  () => import("./components/costs/CostsDashboard")
);
const ComponentPreview = React.lazy(
  () => import("./components/preview/ComponentPreview")
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
// Studio — the beginner-facing agentic-video shell (see docs/agentic-video-product.md)
const StudioHome = React.lazy(() => import("./studio/StudioHome"));
const StudioStoryboardPage = React.lazy(
  () => import("./studio/StudioStoryboardPage")
);
const StudioScriptPage = React.lazy(() => import("./studio/StudioScriptPage"));
const StudioTimelinePage = React.lazy(
  () => import("./studio/StudioTimelinePage")
);
const StudioAccountPage = React.lazy(
  () => import("./studio/StudioAccountPage")
);
import {
  ChatThreadRedirect,
  SettingsRedirect,
  WorkflowEditorRedirect
} from "./components/workspace/RouteRedirects";
import { openSettingsTab } from "./components/workspace/openPageTab";
const LegacyAppRedirect = React.lazy(
  () => import("./components/applications/LegacyAppRedirect")
);
const PublicAppPage = React.lazy(
  () => import("./components/applications/PublicAppPage")
);
const OAuthConsentPage = React.lazy(
  () => import("./components/oauth/OAuthConsentPage")
);

// Defer frontend tool registrations until after initial render.
const registerFrontendTools = () => {
  import("./lib/tools/builtin").catch((error) => {
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

  // The tabbed workspace is the app entry point for both returning and new
  // users; previously-open workflows are restored as tabs from localStorage
  // by the WorkspaceTabsStore, and the workspace's empty state is the
  // new-project surface for anyone with no tabs to restore.
  useEffect(() => {
    if (state === "init") {
      return;
    }
    if (!isAuthRequired() || state === "logged_in") {
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
      path: "/dashboard",
      element: <Navigate to="/workspace" replace />
    },
    {
      // Legacy route — chat threads are workspace tabs now.
      path: "/chat/:thread_id?",
      element: (
        <ProtectedRoute>
          <ChatThreadRedirect />
        </ProtectedRoute>
      )
    },
    {
      path: "/welcome",
      element: <Navigate to="/workspace" replace />
    },
    {
      // Settings is a workspace tab now; the old route only redirects.
      path: "/settings",
      element: (
        <ProtectedRoute>
          <SettingsRedirect />
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
      // Legacy links keyed by workflow id. An app is its own resource now, so
      // these resolve to the app built on that workflow, or 404.
      path: "/miniapp/:workflowId",
      element: (
        <ProtectedRoute>
          <React.Suspense fallback={<LoadingSpinner />}>
            <LegacyAppRedirect />
          </React.Suspense>
        </ProtectedRoute>
      )
    },
    {
      // A mini app deployed to a hidden URL. Deliberately outside
      // `ProtectedRoute`: the whole point is that whoever has the link needs
      // no account. The page runs on a session minted from the token, which
      // reaches this one app's runs and nothing else.
      path: "/a/:token",
      element: (
        <React.Suspense fallback={<LoadingSpinner />}>
          <PublicAppPage />
        </React.Suspense>
      )
    },
    {
      path: "/share/:token",
      element: (
        <ProtectedRoute>
          <React.Suspense fallback={<LoadingSpinner />}>
            <AcceptSharePage />
          </React.Suspense>
        </ProtectedRoute>
      )
    },
    {
      // The confirmation page for a bot-initiated account link; the bridge
      // hands this URL to the user in the chat.
      path: "/integrations/link",
      element: (
        <ProtectedRoute>
          <React.Suspense fallback={<LoadingSpinner />}>
            <IntegrationLinkPage />
          </React.Suspense>
        </ProtectedRoute>
      )
    },
    {
      path: "/editor",
      element: <NavigateToStart />
    },
    {
      // Lands here from the AS's `GET /oauth/authorize` redirect — the SPA
      // half of the consent step in docs/mcp-oauth-design.md.
      path: "/oauth/consent",
      element: (
        <ProtectedRoute>
          <React.Suspense fallback={<LoadingSpinner />}>
            <OAuthConsentPage />
          </React.Suspense>
        </ProtectedRoute>
      )
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
    // Studio: the beginner shell for agentic video creation. Two creation
    // paths (storyboard, script) that both finish in the timeline editor.
    ...(
      [
        { path: "/studio", el: <StudioHome /> },
        { path: "/studio/storyboard/:boardId", el: <StudioStoryboardPage /> },
        { path: "/studio/script/:scriptId", el: <StudioScriptPage /> },
        { path: "/studio/timeline/:sequenceId", el: <StudioTimelinePage /> },
        { path: "/studio/account", el: <StudioAccountPage /> }
      ] as const
    ).map(({ path, el }) => ({
      path,
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
            <React.Suspense fallback={<LoadingSpinner />}>{el}</React.Suspense>
          </div>
        </ProtectedRoute>
      )
    })),
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

  if (isLocalhost) {
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
// Expose the router singleton to components rendered outside the router tree
// (global dialogs), so they can navigate without the useNavigate hook.
registerAppRouter(router);
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root not found");
const root = ReactDOM.createRoot(rootElement);

/**
 * Routes Electron menu/tray actions into the app.
 *
 * "Settings" opens the in-app settings tab (the desktop shell sends an
 * `openSettings` menu event instead of opening a separate window); the tab
 * opens and the router singleton focuses the workspace, which works from any
 * route. "Snap to Grid" toggles the editor setting, and the setting is mirrored
 * back so the View menu checkbox matches whichever surface changed it.
 */
/**
 * Merges the user's custom nodes (JS scripts flagged for the node menu) into
 * the metadata store. It lives here because the hook needs the tRPC provider,
 * which the app root renders.
 */
const CustomNodeMetadataBridge = () => {
  useCustomNodeMetadata();
  return null;
};

const MenuNavigationBridge = () => {
  const snapToGrid = useSettingsStore((state) => state.settings.snapToGrid);
  const setSnapToGrid = useSettingsStore((state) => state.setSnapToGrid);

  const handleMenuEvent = useCallback(
    (data: MenuEventData) => {
      if (data.type === "openSettings") {
        openSettingsTab();
      }
      if (data.type === "toggleSnapToGrid") {
        setSnapToGrid(!useSettingsStore.getState().settings.snapToGrid);
      }
    },
    [setSnapToGrid]
  );
  useMenuHandler(handleMenuEvent);

  useEffect(() => {
    window.api?.setMenuSnapToGrid?.(snapToGrid);
  }, [snapToGrid]);

  return null;
};

const AppWrapper = ({ configReady }: { configReady: Promise<unknown> }) => {
  const [status, setStatus] = useState<string>("pending");
  const [metadataError, setMetadataError] = useState<string>("");
  const [configLoaded, setConfigLoaded] = useState(false);
  const authState = useAuth((s) => s.state);

  // Allow dev-only test pages to render without backend metadata
  const isDevTestRoute =
    isLocalhost &&
    ["/graph", "/preview"].some((p) =>
      window.location.pathname.startsWith(p)
    );

  // A deployed app's public page has no account and never will, so the
  // logged-out branch below would leave it without node metadata — which the
  // runtime needs to decide what a widget renders and what can run in the
  // browser. `/api/nodes/metadata` carries no per-user data and is served
  // without auth, so this route loads it like any signed-in page does.
  const isPublicAppRoute = window.location.pathname.startsWith("/a/");

  useEffect(() => {
    // Register frontend tools after initial render
    registerFrontendTools();
  }, []);

  useEffect(() => {
    let active = true;
    configReady.then(() => {
      if (active) setConfigLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [configReady]);

  useEffect(() => {
    // The auth-mode decision below depends on runtime config; wait for it so a
    // Supabase backend isn't hit with an unauthenticated metadata request.
    if (!configLoaded) {
      return;
    }

    // When auth is enforced, wait until the user is logged in before fetching
    // metadata. When logged out, skip metadata so the router can render and
    // redirect to /login.
    if (isAuthRequired() && authState !== "logged_in" && !isPublicAppRoute) {
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
        setMetadataError(
          error instanceof Error ? error.message : String(error)
        );
        setStatus("error");
      });
  }, [authState, configLoaded, isPublicAppRoute]);

  const shouldRenderRouter =
    isDevTestRoute || status === "success" || status === "logged_out";

  return (
    <React.StrictMode>
      <TRPCProvider>
        <ThemeRoot theme={ThemeNodetool}>
          <MobileClassProvider>
            <MenuProvider>
              <MenuNavigationBridge />
              <CustomNodeMetadataBridge />
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
                      <ReportBugButton
                        variant="outlined"
                        label="Report a bug"
                        context={{
                          source: "app-crash",
                          summary: "Error loading application metadata",
                          errorText: metadataError
                        }}
                      />
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
                      <ProviderOnboardingDialog />
                    </>
                  )}
                  {/* Outside the router gate: a boot failure is exactly when
                      someone needs to report a bug. */}
                  <BugReportDialogHost />
                </KeyboardProvider>
              </WorkflowManagerProvider>
            </MenuProvider>
          </MobileClassProvider>
        </ThemeRoot>
      </TRPCProvider>
    </React.StrictMode>
  );
};

// Record console output and uncaught errors from the first line on, so a bug
// report can carry them without the reporter having had devtools open.
installConsoleCapture();

// Start the largest boot payload (node metadata) immediately so its download
// overlaps the runtime-config round-trip below instead of running after it.
prefetchMetadata();

// Learn auth mode and Supabase credentials from the backend before wiring up
// the client and auth, so the frontend reflects the server's configuration
// without any build-time VITE_* values.
const configReady = loadRuntimeConfig().then((config) => {
  initSupabaseFromConfig(config);
  useAuth.getState().initialize();
  initKeyListeners();
  // Load Plausible on the production website only (never local/dev/Electron).
  initAnalytics();
  return config;
});
configReady.catch((err) => console.error(err));

// Render the shell right away — the loading spinner appears without waiting on
// the /api/config round-trip. AppWrapper holds back the router (and any
// auth-mode metadata decision) until `configReady` resolves.
root.render(<AppWrapper configReady={configReady} />);

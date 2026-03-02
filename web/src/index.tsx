/** @jsxImportSource @emotion/react */
// Ensure global MUI/Emotion type augmentations are loaded in the TS program
import type { } from "./theme";
import type { } from "./emotion";
import type { } from "./material-ui";
import type { } from "./window";

// Early polyfills / globals must come before other imports.
import "./prismGlobal";

import React, { Suspense, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkflowManager } from "./contexts/WorkflowManagerContext";
import ReactDOM from "react-dom/client";

import {
  RouteObject,
  RouterProvider,
  createBrowserRouter
} from "react-router-dom";

import ErrorBoundary from "./ErrorBoundary";

// Lazy-load panel components to reduce initial bundle size
const PanelLeft = React.lazy(
  () => import("./components/panels/PanelLeft")
);
const PanelRight = React.lazy(
  () => import("./components/panels/PanelRight")
);
const PanelBottom = React.lazy(
  () => import("./components/panels/PanelBottom")
);
import { CircularProgress } from "@mui/material";
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
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queryClient";
import { useAssetStore } from "./stores/AssetStore";
import Login from "./components/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import useAuth from "./stores/useAuth";
import { useSettingsStore } from "./stores/SettingsStore";
import { isLocalhost } from "./stores/ApiClient";
import { initKeyListeners } from "./stores/KeyPressedStore";
import useRemoteSettingsStore from "./stores/RemoteSettingStore";
import { loadMetadata } from "./serverState/useMetadata";
import useMetadataStore from "./stores/MetadataStore";
import {
  getComfyUIService,
  getDefaultComfyBaseUrl,
  normalizeComfyBaseUrl
} from "./services/ComfyUIService";
import { comfyObjectInfoToMetadataMap } from "./utils/comfySchemaConverter";
import {
  FetchCurrentWorkflow,
  WorkflowManagerProvider
} from "./contexts/WorkflowManagerContext";
import KeyboardProvider from "./components/KeyboardProvider";
import { MenuProvider } from "./providers/MenuProvider";
const DownloadManagerDialog = React.lazy(
  () => import("./components/hugging_face/DownloadManagerDialog")
);

import log from "loglevel";
import { installIpcLogBridge } from "./logging/ipcLogBridge";
const Alert = React.lazy(
  () => import("./components/node_editor/Alert")
);
import MobileClassProvider from "./components/MobileClassProvider";
const AppHeader = React.lazy(
  () => import("./components/panels/AppHeader")
);

// Lazy-loaded route components for code splitting
const Dashboard = React.lazy(
  () => import("./components/dashboard/Dashboard")
);
const GlobalChat = React.lazy(
  () => import("./components/chat/containers/GlobalChat")
);
const StandaloneChat = React.lazy(
  () => import("./components/chat/containers/StandaloneChat")
);
const MiniAppPage = React.lazy(
  () => import("./components/miniapps/MiniAppPage")
);
const StandaloneMiniApp = React.lazy(
  () => import("./components/miniapps/StandaloneMiniApp")
);
const ModelListIndex = React.lazy(
  () => import("./components/hugging_face/model_list/ModelListIndex")
);
const TabsNodeEditor = React.lazy(
  () => import("./components/editor/TabsNodeEditor")
);
const AssetExplorer = React.lazy(
  () => import("./components/assets/AssetExplorer")
);
const AssetEditor = React.lazy(
  () => import("./components/assets/AssetEditor")
);
const CollectionsExplorer = React.lazy(
  () => import("./components/collections/CollectionsExplorer")
);
const TemplateGrid = React.lazy(
  () => import("./components/workflows/ExampleGrid")
);
const LayoutTest = React.lazy(() => import("./components/LayoutTest"));
const ChatMarkdownTest = React.lazy(() => import("./components/ChatMarkdownTest"));

// Defer frontend tool registrations until after initial render
const registerFrontendTools = () => {
  Promise.all([
    import("./lib/tools/builtin/addNode"),
    import("./lib/tools/builtin/setNodeSyncMode"),
    import("./lib/tools/builtin/connectNodes"),
    import("./lib/tools/builtin/updateNodeData"),
    import("./lib/tools/builtin/moveNode"),
    import("./lib/tools/builtin/setNodeTitle"),
    import("./lib/tools/builtin/graph"),
    import("./lib/tools/builtin/getGraph"),
    import("./lib/tools/builtin/searchNodes"),
    import("./lib/tools/builtin/deleteNode"),
    import("./lib/tools/builtin/deleteEdge"),
  ]).catch((error) => {
    console.error("Failed to register frontend tools:", error);
  });
};
import { useModelDownloadStore } from "./stores/ModelDownloadStore";

(window as any).log = log;
installIpcLogBridge();

if (isLocalhost) {
  useRemoteSettingsStore.getState().fetchSettings().catch(console.error);
}

const NavigateToStart = () => {
  const { state } = useAuth((auth) => ({ state: auth.state }));
  const showWelcomeOnStartup = useSettingsStore((state) => state.settings.showWelcomeOnStartup);
  const createNewWorkflow = useWorkflowManager((state) => state.createNew);
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);

  // Handle navigation based on settings
  useEffect(() => {
    const handleNavigation = async () => {
      // Helper to get workflow to open (current > first open > null)
      const getExistingWorkflowId = (): string | null => {
        const currentWorkflowId = localStorage.getItem("currentWorkflowId");
        if (currentWorkflowId) {
          return currentWorkflowId;
        }
        const openWorkflows = JSON.parse(localStorage.getItem("openWorkflows") || "[]") as string[];
        if (openWorkflows.length > 0) {
          return openWorkflows[0];
        }
        return null;
      };

      const navigateToEditor = async () => {
        // Check for existing workflow first
        const existingWorkflowId = getExistingWorkflowId();
        if (existingWorkflowId) {
          navigate(`/editor/${existingWorkflowId}`, { replace: true });
          return;
        }

        // Only create new if no workflows are open
        if (!isProcessing) {
          setIsProcessing(true);
          try {
            const workflow = await createNewWorkflow();
            navigate(`/editor/${workflow.id}`, { replace: true });
          } catch (error) {
            console.error("Failed to create workflow:", error);
            navigate("/dashboard", { replace: true });
          }
        }
      };

      if (isLocalhost) {
        if (!showWelcomeOnStartup) {
          await navigateToEditor();
        } else {
          navigate("/dashboard", { replace: true });
        }
      } else if (state === "logged_in") {
        if (!showWelcomeOnStartup) {
          await navigateToEditor();
        } else {
          navigate("/dashboard", { replace: true });
        }
      } else if (state === "logged_out" || state === "error") {
        navigate("/login", { replace: true });
      }
    };

    if (state !== "init") {
      void handleNavigation();
    }
  }, [state, showWelcomeOnStartup, createNewWorkflow, navigate, isProcessing]);

  if (state === "init") {
    return null;
  }

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
      element: (
        <ProtectedRoute>
          <PanelLeft />
          <Dashboard />
          <PanelBottom />
        </ProtectedRoute>
      )
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
              <PanelBottom />
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
              <PanelBottom />
            </div>
          </>
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
      path: "/standalone-chat/:thread_id?",
      element: (
        <ProtectedRoute>
          <div
            style={{
              display: "flex",
              width: "100%",
              height: "100%"
            }}
          >
            <PanelLeft />
            <StandaloneChat />
            <PanelBottom />
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
          <PanelLeft />
          <AssetExplorer />
        </ProtectedRoute>
      )
    },
    {
      path: "assets/edit/:assetId",
      element: (
        <ProtectedRoute>
          <AssetEditor />
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
                <PanelBottom />
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
    routes.push({
      path: "/chatmarkdowntest",
      element: <ChatMarkdownTest />
    });
  }

  routes.forEach((route) => {
    route.ErrorBoundary = ErrorBoundary;
  });

  return routes;
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
const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

const preloadComfyMetadata = async (): Promise<void> => {
  try {
    const configuredComfyUrl = normalizeComfyBaseUrl(
      localStorage.getItem("comfyui_base_url") || getDefaultComfyBaseUrl()
    );
    const service = getComfyUIService();
    service.setBaseUrl(configuredComfyUrl);

    const objectInfo = await service.fetchObjectInfo();
    const comfyMetadata = comfyObjectInfoToMetadataMap(objectInfo);
    const comfyMetadataCount = Object.keys(comfyMetadata).length;
    if (comfyMetadataCount === 0) {
      return;
    }

    const metadataStore = useMetadataStore.getState();
    metadataStore.setMetadata({
      ...metadataStore.metadata,
      ...comfyMetadata
    });

    const registeredNodeTypes = metadataStore.nodeTypes;
    const baseNodeComponent =
      registeredNodeTypes["nodetool.workflows.base_node.Preview"] ||
      Object.values(registeredNodeTypes)[0];

    if (baseNodeComponent) {
      Object.keys(comfyMetadata).forEach((nodeType) => {
        metadataStore.addNodeType(nodeType, baseNodeComponent);
      });
    }

    log.info(
      `[startup] Loaded ${comfyMetadataCount} ComfyUI node metadata entries from ${configuredComfyUrl}`
    );
  } catch (error) {
    log.warn(
      "[startup] ComfyUI metadata preload skipped (service unavailable or unreachable)",
      error
    );
  }
};

const AppWrapper = () => {
  const [status, setStatus] = useState<string>("pending");

  // Allow dev-only test pages to render without backend metadata
  const isDevTestRoute =
    isLocalhost &&
    ["/layouttest", "/chatmarkdowntest"].some((p) =>
      window.location.pathname.startsWith(p)
    );

  useEffect(() => {
    // Register frontend tools after initial render
    registerFrontendTools();

    // Existing effect for loading metadata
    loadMetadata()
      .then((data) => {
        setStatus(data);
        if (data === "success") {
          // Load Comfy metadata in the background so imported comfy workflows
          // are immediately recognized without manual connect steps.
          void preloadComfyMetadata();
        }
      })
      .catch((error) => {
        console.error("Failed to load metadata:", error);
        setStatus("error"); // Ensure status is set to error on promise rejection
      });
  }, []); // Empty dependency array ensures this runs only once on mount

  const shouldRenderRouter =
    isDevTestRoute || (status !== "pending" && status !== "error");

  return (
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <InitColorSchemeScript attribute="class" defaultMode="dark" />
        <ThemeProvider theme={ThemeNodetool} defaultMode="dark">
          <CssBaseline />
          <MobileClassProvider>
            <MenuProvider>
              <WorkflowManagerProvider queryClient={queryClient}>
                <KeyboardProvider active={true}>
                  {status === "pending" && !isDevTestRoute && (
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
                  {status === "error" && !isDevTestRoute && (
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
                  {shouldRenderRouter && (
                    <>
                      <Suspense
                        fallback={
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "center",
                              alignItems: "center",
                              height: "100vh",
                              width: "100%"
                            }}
                          >
                            <CircularProgress />
                          </div>
                        }
                      >
                        <RouterProvider router={router} />
                      </Suspense>
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

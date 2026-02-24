/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import React, {
  useCallback,
  useState,
  useEffect,
  useMemo,
  useRef,
  memo
} from "react";
import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { LanguageModel, Thread } from "../../stores/ApiTypes";
import { useSettingsStore } from "../../stores/SettingsStore";
import isEqual from "lodash/isEqual";
import DashboardHeader from "./DashboardHeader";
import { DockviewReact, DockviewReadyEvent, DockviewApi } from "dockview";
import AddPanelDropdown from "./AddPanelDropdown";
import { DEFAULT_MODEL } from "../../config/constants";
import { defaultLayout } from "../../config/defaultLayouts";
import { applyDockviewLayoutSafely } from "../../utils/dockviewLayout";
import LayoutMenu from "./LayoutMenu";
import { useLayoutStore } from "../../stores/LayoutStore";
import { useDashboardData } from "../../hooks/useDashboardData";
import { useWorkflowActions } from "../../hooks/useWorkflowActions";
import { useChatService } from "../../hooks/useChatService";
import { useEnsureChatConnected } from "../../hooks/useEnsureChatConnected";
import { PANEL_CONFIG } from "./panelConfig";
import { uuidv4 } from "../../stores/uuidv4";
import { createPanelComponents } from "./panelComponents";
import { PanelInfo } from "./AddPanelDropdown";
import AppHeader from "../panels/AppHeader";
import { usePanelStore } from "../../stores/PanelStore";

const styles = (theme: Theme) =>
  css({
    ".dashboard": {
      width: "100vw",
      height: "100vh",
      position: "relative",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      top: "0",
      left: "0",
      paddingTop: "64px",
      paddingLeft: "64px",
      boxSizing: "border-box",
      backgroundColor: theme.vars.palette.c_editor_bg_color
    },
    "& .dockview-container": {
      paddingTop: "1rem",
      flex: 1,
      minHeight: 0,
      height: "100%"
    },
    // CONTENT
    "& .dv-react-part": {
      paddingTop: ".2rem"
    },
    // CHAT
    "& .chat-input-section": {
      marginTop: 0,
      paddingTop: 0
    },
    ".chat-controls": {
      marginTop: 0,
      paddingTop: 0
    }
  });

const Dashboard: React.FC = () => {
  const theme = useTheme();

  // Subscribe to settings individually to prevent unnecessary re-renders
  const settings = useSettingsStore((state) => state.settings);
  const setWorkflowOrder = useSettingsStore((state) => state.setWorkflowOrder);

  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
  // const [availablePanels, setAvailablePanels] = useState<any[]>([]);
  const [availablePanels, setAvailablePanels] = useState<PanelInfo[]>([]);

  const isMountedRef = useRef(true);

  // Ensure WebSocket connection while dashboard is visible
  useEnsureChatConnected({ disconnectOnUnmount: false });

  // Close panelLeft when dashboard route is opened
  useEffect(() => {
    usePanelStore.getState().setVisibility(false);
  }, []);

  const tryParseModel = useCallback((model: string) => {
    try {
      return JSON.parse(model);
    } catch {
      return DEFAULT_MODEL;
    }
  }, []);

  const [selectedModel, setSelectedModel] = useState<LanguageModel>(() => {
    const savedModel = localStorage.getItem("selectedModel");
    return savedModel ? tryParseModel(savedModel) : DEFAULT_MODEL;
  });
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [agentMode, setAgentMode] = useState(false);

  useEffect(() => {
    localStorage.setItem("selectedModel", JSON.stringify(selectedModel));
  }, [selectedModel]);

  const {
    isLoadingWorkflows,
    sortedWorkflows,
    isLoadingTemplates,
    startTemplates
  } = useDashboardData();

  const {
    loadingExampleId,
    handleCreateNewWorkflow,
    handleWorkflowClick: _handleWorkflowClick,
    handleExampleClick,
    handleViewAllTemplates
  } = useWorkflowActions();

  const {
    status,
    sendMessage,
    onNewThread,
    onSelectThread,
    getThreadPreview,
    threads,
    deleteThread,
    progress,
    statusMessage,
    stopGeneration,
    currentPlanningUpdate,
    currentTaskUpdate,
    currentThreadId
  } = useChatService(selectedModel);

  const handleModelChange = useCallback((model: LanguageModel) => {
    setSelectedModel(model);
  }, []);

  const _handleOrderChange = useCallback(
    (_event: React.MouseEvent<HTMLElement>, newOrder: string | null) => {
      if (newOrder !== null) {
        setWorkflowOrder(newOrder as "name" | "date");
      }
    },
    [setWorkflowOrder]
  );

  const handleToolsChange = useCallback((tools: string[]) => {
    setSelectedTools((prev) => (isEqual(prev, tools) ? prev : tools));
  }, []);

  const panelParams = useMemo(() => {
    return {
      "getting-started": {
        sortedWorkflows,
        isLoadingWorkflows,
        startTemplates,
        isLoadingTemplates,
        handleExampleClick,
        handleCreateNewWorkflow
      },
      activity: {
        // Chats
        threads: threads as { [key: string]: Thread },
        currentThreadId,
        onNewThread: onNewThread,
        onSelectThread: onSelectThread,
        onDeleteThread: deleteThread,
        getThreadPreview
      },
      templates: {
        startTemplates,
        isLoadingTemplates,
        loadingExampleId,
        handleExampleClick,
        handleViewAllTemplates
      },
      workflows: {},
      "recent-chats": {
        threads: threads as { [key: string]: Thread },
        currentThreadId,
        onNewThread: onNewThread,
        onSelectThread: onSelectThread,
        onDeleteThread: deleteThread,
        getThreadPreview
      },
      chat: {
        status,
        sendMessage,
        progress,
        statusMessage,
        model: selectedModel,
        selectedTools,
        onToolsChange: handleToolsChange,
        onModelChange: handleModelChange,
        onStop: stopGeneration,
        onNewChat: onNewThread,
        agentMode,
        onAgentModeToggle: setAgentMode,
        currentPlanningUpdate,
        currentTaskUpdate
      }
    };
  }, [
    startTemplates,
    isLoadingTemplates,
    loadingExampleId,
    handleExampleClick,
    handleViewAllTemplates,
    sortedWorkflows,
    isLoadingWorkflows,
    handleCreateNewWorkflow,
    threads,
    currentThreadId,
    onNewThread,
    onSelectThread,
    deleteThread,
    getThreadPreview,
    status,
    sendMessage,
    progress,
    statusMessage,
    selectedModel,
    selectedTools,
    handleToolsChange,
    handleModelChange,
    stopGeneration,
    agentMode,
    setAgentMode,
    currentPlanningUpdate,
    currentTaskUpdate
  ]);

  const panelComponents = useMemo(() => createPanelComponents(), []);

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const { api } = event;
      setDockviewApi(api);

      const { activeLayoutId, layouts } = useLayoutStore.getState();
      const activeLayout = (layouts || []).find((l) => l.id === activeLayoutId);

      if (activeLayout) {
        applyDockviewLayoutSafely(api, activeLayout.layout);
      } else {
        applyDockviewLayoutSafely(api, defaultLayout);
      }

      // Note: Welcome panel opening is handled in useEffect below
      // to ensure it works even when layouts are loaded
    },

    []
  );

  // Track mount status for memory leak prevention
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Ensure welcome panel is shown when showWelcomeOnStartup is enabled
  useEffect(() => {
    if (!dockviewApi || !settings.showWelcomeOnStartup) {return;}

    // Check if welcome panel already exists
    if (dockviewApi.getPanel("welcome")) {return;}

    // Small delay to ensure layout is fully applied
    const timeoutId = setTimeout(() => {
      if (!dockviewApi) {return;}

      // Find the first panel to position welcome to its left
      const panels = dockviewApi.panels;
      const firstPanel = panels.length > 0 ? panels[0] : null;

      if (firstPanel && firstPanel.id !== "welcome") {
        // Position welcome panel to the left of the first panel
        dockviewApi.addPanel({
          id: "welcome",
          component: "welcome",
          title: PANEL_CONFIG.welcome.title,
          params: {},
          position: {
            referencePanel: firstPanel.id,
            direction: "left"
          }
        });
      } else {
        // Fallback: add as first panel if no panels exist
        dockviewApi.addPanel({
          id: "welcome",
          component: "welcome",
          title: PANEL_CONFIG.welcome.title,
          params: {}
        });
      }
    }, 200);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [dockviewApi, settings.showWelcomeOnStartup]);



  useEffect(() => {
    if (!dockviewApi) {return;}

    const allPanelIds = Object.keys(PANEL_CONFIG);

    const updateAvailablePanels = () => {
      const openPanelIds = dockviewApi.panels.map((p) => p.id);
      const closedPanels = allPanelIds
        .filter((id) => id === "mini-app" || !openPanelIds.includes(id))
        .map((id) => ({
          id,
          title: PANEL_CONFIG[id as keyof typeof PANEL_CONFIG].title
        }));
      setAvailablePanels(closedPanels);
    };

    updateAvailablePanels();

    const disposableAdd = dockviewApi.onDidAddPanel(updateAvailablePanels);
    const disposableRemove = dockviewApi.onDidRemovePanel(
      updateAvailablePanels
    );

    return () => {
      disposableAdd.dispose();
      disposableRemove.dispose();
    };
  }, [dockviewApi]);

  useEffect(() => {
    if (!dockviewApi) {return;}

    Object.entries(panelParams).forEach(([id, params]) => {
      const panel = dockviewApi.getPanel(id);
      if (panel && !isEqual(panel.params, params)) {
        panel.update({ params });
      }
    });
  }, [dockviewApi, panelParams]);

  const handleAddPanel = useCallback(
    (panelId: string) => {
      if (!dockviewApi) {
        return;
      }
      
      // Position getting-started panel to the left of the first panel if it exists
      if (panelId === "getting-started") {
        const panels = dockviewApi.panels;
        const firstPanel = panels.length > 0 ? panels[0] : null;
        
        if (firstPanel && firstPanel.id !== "getting-started") {
          dockviewApi.addPanel({
            id: panelId,
            component: panelId,
            title: PANEL_CONFIG[panelId as keyof typeof PANEL_CONFIG].title,
            params: panelParams[panelId as keyof typeof panelParams] || {},
            position: {
              referencePanel: firstPanel.id,
              direction: "left"
            }
          });
          return;
        }
      }
      
      // Position welcome panel to the left of the first panel if it exists
      if (panelId === "welcome") {
        const panels = dockviewApi.panels;
        const firstPanel = panels.length > 0 ? panels[0] : null;
        
        if (firstPanel && firstPanel.id !== "welcome") {
          dockviewApi.addPanel({
            id: panelId,
            component: panelId,
            title: PANEL_CONFIG[panelId as keyof typeof PANEL_CONFIG].title,
            params: panelParams[panelId as keyof typeof panelParams] || {},
            position: {
              referencePanel: firstPanel.id,
              direction: "left"
            }
          });
          return;
        }
      }
      
      // Position setup panel to the right of welcome panel if it exists, otherwise right of first panel
      if (panelId === "setup") {
        const welcomePanel = dockviewApi.getPanel("welcome");
        const panels = dockviewApi.panels;
        const referencePanel = welcomePanel || (panels.length > 0 ? panels[0] : null);
        
        if (referencePanel && referencePanel.id !== "setup") {
          dockviewApi.addPanel({
            id: panelId,
            component: panelId,
            title: PANEL_CONFIG[panelId as keyof typeof PANEL_CONFIG].title,
            params: panelParams[panelId as keyof typeof panelParams] || {},
            position: {
              referencePanel: referencePanel.id,
              direction: "right"
            }
          });
          return;
        }
      }

      if (panelId === "mini-app") {
        dockviewApi.addPanel({
          id: `mini-app-${uuidv4()}`,
          component: "mini-app",
          title: PANEL_CONFIG["mini-app"].title,
          params: {}
        });
        return;
      }
      
      // Default behavior for other panels
      dockviewApi.addPanel({
        id: panelId,
        component: panelId,
        title: PANEL_CONFIG[panelId as keyof typeof PANEL_CONFIG].title,
        params: panelParams[panelId as keyof typeof panelParams] || {}
      });
    },
    [dockviewApi, panelParams]
  );

  return (
    <Box css={styles(theme)}>
      <Box
        className="actions-container"
        sx={{
          position: "absolute",
          top: "32px",
          left: 0,
          right: 0,
          zIndex: 1000
        }}
      >
        <AppHeader />
      </Box>
      <Box
        className="dashboard"
      >
        <DashboardHeader>
          <LayoutMenu dockviewApi={dockviewApi} />
          <AddPanelDropdown
            availablePanels={availablePanels}
            onAddPanel={handleAddPanel}
          />
        </DashboardHeader>
        <DockviewReact
          components={panelComponents}
          onReady={onReady}
          className="dockview-container"
        />
      </Box>
    </Box>
  );
};

export default memo(Dashboard);

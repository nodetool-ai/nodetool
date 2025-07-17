/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import React, {
  useCallback,
  useState,
  useEffect,
  useMemo,
  useRef
} from "react";
import { Box } from "@mui/material";
import { LanguageModel, Thread } from "../../stores/ApiTypes";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { isEqual } from "lodash";
import DashboardHeader from "./DashboardHeader";
import {
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
  DockviewApi
} from "dockview";
import "dockview/dist/styles/dockview.css";
import AddPanelDropdown from "./AddPanelDropdown";
import { DEFAULT_MODEL } from "../../config/constants";
import { defaultLayout } from "../../config/defaultLayouts";
import LayoutMenu from "./LayoutMenu";
import { useLayoutStore } from "../../stores/LayoutStore";
import { useDashboardData } from "../../hooks/useDashboardData";
import { useWorkflowActions } from "../../hooks/useWorkflowActions";
import { useChatService } from "../../hooks/useChatService";
import { Button } from "@mui/material";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { PANEL_CONFIG, PanelProps } from "./panelConfig";
import { createPanelComponents } from "./panelComponents";

const styles = (theme: Theme) =>
  css({
    "&": {
      width: "100vw",
      height: "100vh",
      backgroundColor: theme.palette.background.default,
      overflow: "hidden"
    },
    // DOCKVIEW
    "& .dockview-container": {
      paddingTop: "2rem"
    },
    // TABS AND ACTIONS
    ".dv-tabs-and-actions-container": {
      backgroundColor: "transparent",
      position: "absolute",
      height: "1.5rem",
      top: 3,
      left: 2,
      right: 10,
      zIndex: 1,
      opacity: 0,
      transition: "opacity 0.2s ease-in-out"
    },
    "& .dv-tab": {
      textTransform: "uppercase",
      backgroundColor: "transparent",
      fontSize: theme.fontSizeTiny,
      padding: "0 .5em",
      height: "1.5rem"
    },
    ".dv-tabs-and-actions-container:hover": {
      opacity: 1,
      backgroundColor: theme.palette.grey[700]
    },
    // CONTENT
    "& .dv-react-part": {
      paddingTop: ".2rem"
    },
    // DRAG HANDLE
    "& .dv-split-view-container > .dv-sash-container > .dv-sash": {
      backgroundColor: theme.palette.grey[900],
      transitionDelay: "0s !important"
    },
    "& .dv-split-view-container > .dv-sash-container > .dv-sash:hover": {
      backgroundColor: "var(--palette-grey-600) !important"
    },
    "& .dv-split-view-container.dv-horizontal > .dv-sash-container > .dv-sash":
      {
        width: "6px",
        transform: "translate(-3px, 0px)"
      },
    "& .dv-split-view-container.dv-vertical > .dv-sash-container > .dv-sash": {
      height: "6px",
      transform: "translate(0px, 3px)"
    },
    // ------------------------------------------
    // CHAT
    "& .chat-view": {
      height: "fit-content"
    },
    "& .chat-input-section": {
      marginTop: 0
    }
  });

const Dashboard: React.FC = () => {
  const settings = useSettingsStore((state) => state.settings);
  const setWorkflowOrder = useSettingsStore((state) => state.setWorkflowOrder);
  const { currentWorkflowId } = useWorkflowManager((state) => ({
    currentWorkflowId: state.currentWorkflowId
  }));
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
  const [availablePanels, setAvailablePanels] = useState<any[]>([]);
  const isMountedRef = useRef(true);

  // Ensure WebSocket connection is established when Dashboard mounts
  useEffect(() => {
    const { status, connect } = useGlobalChatStore.getState();
    if (status === "disconnected" || status === "failed") {
      connect().catch((error) => {
        console.error("Dashboard: Failed to establish chat connection:", error);
      });
    }
  }, []);

  const tryParseModel = (model: string) => {
    try {
      return JSON.parse(model);
    } catch (error) {
      return DEFAULT_MODEL;
    }
  };

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
    isLoadingExamples,
    startExamples
  } = useDashboardData();

  const {
    loadingExampleId,
    handleCreateNewWorkflow,
    handleWorkflowClick,
    handleExampleClick,
    handleViewAllExamples
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

  const handleOrderChange = useCallback(
    (_: any, newOrder: any) => {
      if (newOrder !== null) {
        setWorkflowOrder(newOrder);
      }
    },
    [setWorkflowOrder]
  );

  const handleToolsChange = useCallback((tools: string[]) => {
    setSelectedTools((prev) => (isEqual(prev, tools) ? prev : tools));
  }, []);

  const panelParams = useMemo(() => {
    return {
      examples: {
        startExamples,
        isLoadingExamples,
        loadingExampleId,
        handleExampleClick,
        handleViewAllExamples
      },
      workflows: {
        sortedWorkflows,
        isLoadingWorkflows,
        settings,
        handleOrderChange,
        handleCreateNewWorkflow,
        handleWorkflowClick
      },
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
    startExamples,
    isLoadingExamples,
    loadingExampleId,
    handleExampleClick,
    handleViewAllExamples,
    sortedWorkflows,
    isLoadingWorkflows,
    settings,
    handleOrderChange,
    handleCreateNewWorkflow,
    handleWorkflowClick,
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
        api.fromJSON(activeLayout.layout);
      } else {
        api.fromJSON(defaultLayout);
      }
    },

    []
  );

  // Remove automatic debounced saving - layouts should be saved explicitly
  // Keep this function for explicit saves when needed
  const saveLayout = useCallback(() => {
    if (!isMountedRef.current || !dockviewApi) return;

    try {
      const { activeLayoutId, updateActiveLayout } = useLayoutStore.getState();
      if (activeLayoutId) {
        const layout = dockviewApi.toJSON();
        updateActiveLayout(layout);
      }
    } catch (error) {
      console.error("Failed to save layout:", error);
    }
  }, [dockviewApi]);

  // Track mount status for memory leak prevention
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!dockviewApi) return;

    const allPanelIds = Object.keys(PANEL_CONFIG);

    const updateAvailablePanels = () => {
      const openPanelIds = dockviewApi.panels.map((p) => p.id);
      const closedPanels = allPanelIds
        .filter((id) => !openPanelIds.includes(id))
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
    if (!dockviewApi) return;

    Object.entries(panelParams).forEach(([id, params]) => {
      const panel = dockviewApi.getPanel(id);
      if (panel && !isEqual(panel.params, params)) {
        panel.update({ params });
      }
    });
  }, [dockviewApi, panelParams]);

  const handleAddPanel = useCallback(
    (panelId: string) => {
      if (!dockviewApi) return;
      dockviewApi.addPanel({
        id: panelId,
        component: panelId,
        title: PANEL_CONFIG[panelId as keyof typeof PANEL_CONFIG].title,
        params: panelParams[panelId as keyof typeof panelParams]
      });
    },
    [dockviewApi, panelParams]
  );

  return (
    <Box
      className="dashboard"
      css={styles}
      sx={{ height: "100vh", width: "100vw", position: "relative" }}
    >
      <DashboardHeader showBackToEditor={!!currentWorkflowId}>
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
  );
};

export default Dashboard;

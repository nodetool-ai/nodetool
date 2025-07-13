/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import React, { useCallback, useState, useEffect, useMemo } from "react";
import { Box } from "@mui/material";
import { LanguageModel, Thread } from "../../stores/ApiTypes";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { isEqual } from "lodash";
import ChatView from "../chat/containers/ChatView";
import ExamplesList from "./ExamplesList";
import WorkflowsList from "./WorkflowsList";
import RecentChats from "./RecentChats";
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
import { useDashboardData } from "../../hooks/useDashboardData";
import { useWorkflowActions } from "../../hooks/useWorkflowActions";
import { useChatService } from "../../hooks/useChatService";

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
      top: 7,
      left: 2,
      right: 10,
      zIndex: 1,
      opacity: 0,
      transition: "opacity 0.2s ease-in-out"
    },
    "& .dv-tab": {
      textTransform: "uppercase",
      backgroundColor: "transparent",
      fontSize: theme.fontSizeSmaller
    },
    ".dv-tabs-and-actions-container:hover": {
      opacity: 1,
      backgroundColor: theme.palette.grey[700]
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
    "& .chat-input-section": {
      marginTop: 0
    }
  });

interface PanelProps {
  [key: string]: any;
}

const Dashboard: React.FC = () => {
  const settings = useSettingsStore((state) => state.settings);
  const setWorkflowOrder = useSettingsStore((state) => state.setWorkflowOrder);
  const { currentWorkflowId } = useWorkflowManager((state) => ({
    currentWorkflowId: state.currentWorkflowId
  }));
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
  const [availablePanels, setAvailablePanels] = useState<any[]>([]);

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

  const panelComponents = useMemo(
    () => ({
      examples: (props: IDockviewPanelProps<PanelProps>) => (
        <ExamplesList
          startExamples={props.params?.startExamples || []}
          isLoadingExamples={props.params?.isLoadingExamples ?? true}
          loadingExampleId={props.params?.loadingExampleId || null}
          handleExampleClick={props.params?.handleExampleClick || (() => {})}
          handleViewAllExamples={
            props.params?.handleViewAllExamples || (() => {})
          }
        />
      ),
      workflows: (props: IDockviewPanelProps<PanelProps>) => (
        <WorkflowsList
          sortedWorkflows={props.params?.sortedWorkflows || []}
          isLoadingWorkflows={props.params?.isLoadingWorkflows ?? true}
          settings={props.params?.settings || {}}
          handleOrderChange={props.params?.handleOrderChange || (() => {})}
          handleCreateNewWorkflow={
            props.params?.handleCreateNewWorkflow || (() => {})
          }
          handleWorkflowClick={props.params?.handleWorkflowClick || (() => {})}
        />
      ),
      "recent-chats": (props: IDockviewPanelProps<PanelProps>) => (
        <Box sx={{ overflow: "auto", height: "100%" }}>
          <RecentChats
            threads={props.params?.threads || {}}
            currentThreadId={props.params?.currentThreadId || null}
            onNewThread={props.params?.onNewThread || (() => {})}
            onSelectThread={props.params?.onSelectThread || (() => {})}
            onDeleteThread={props.params?.onDeleteThread || (() => {})}
            getThreadPreview={
              props.params?.getThreadPreview || (() => "No messages yet")
            }
          />
        </Box>
      ),
      chat: (props: IDockviewPanelProps<PanelProps>) => (
        <ChatView
          status={props.params?.status || "disconnected"}
          messages={[]}
          sendMessage={props.params?.sendMessage || (() => {})}
          progress={props.params?.progress?.current || 0}
          total={props.params?.progress?.total || 0}
          progressMessage={props.params?.statusMessage || ""}
          model={props.params?.model || DEFAULT_MODEL}
          selectedTools={props.params?.selectedTools || []}
          onToolsChange={props.params?.onToolsChange || (() => {})}
          onModelChange={props.params?.onModelChange || (() => {})}
          onStop={props.params?.onStop || (() => {})}
          agentMode={props.params?.agentMode || false}
          onAgentModeToggle={props.params?.onAgentModeToggle || (() => {})}
          currentPlanningUpdate={props.params?.currentPlanningUpdate || null}
          currentTaskUpdate={props.params?.currentTaskUpdate || null}
        />
      )
    }),
    []
  );

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const { api } = event;
      setDockviewApi(api);

      api.clear();

      const chatPanel = api.addPanel({
        id: "chat",
        component: "chat",
        title: "Chat",
        params: panelParams.chat
      });

      const examplesPanel = api.addPanel({
        id: "examples",
        component: "examples",
        title: "Examples",
        position: { direction: "above", referencePanel: chatPanel },
        params: panelParams.examples
      });

      const workflowsPanel = api.addPanel({
        id: "workflows",
        component: "workflows",
        title: "Recent Workflows",
        position: { direction: "right", referencePanel: examplesPanel },
        params: panelParams.workflows
      });

      api.addPanel({
        id: "recent-chats",
        component: "recent-chats",
        title: "Recent Chats",
        position: { direction: "right", referencePanel: workflowsPanel },
        params: panelParams["recent-chats"]
      });

      chatPanel.api.setSize({ height: 100 });
    },

    [panelParams]
  );

  useEffect(() => {
    if (!dockviewApi) return;

    const allPanelIds = ["examples", "workflows", "recent-chats", "chat"];

    const updateAvailablePanels = () => {
      const openPanelIds = dockviewApi.panels.map((p) => p.id);
      const closedPanels = allPanelIds
        .filter((id) => !openPanelIds.includes(id))
        .map((id) => ({ id, title: id.charAt(0).toUpperCase() + id.slice(1) }));
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

  const handleAddPanel = useCallback(
    (panelId: string) => {
      if (!dockviewApi) return;
      dockviewApi.addPanel({
        id: panelId,
        component: panelId,
        title: panelId.charAt(0).toUpperCase() + panelId.slice(1),
        params: panelParams[panelId as keyof typeof panelParams]
      });
    },
    [dockviewApi, panelParams]
  );

  useEffect(() => {
    if (!dockviewApi) return;

    Object.entries(panelParams).forEach(([id, params]) => {
      const panel = dockviewApi.getPanel(id);
      if (panel && !isEqual(panel.params, params)) {
        panel.update({ params });
      }
    });
  }, [dockviewApi, panelParams]);

  return (
    <Box
      className="dashboard"
      css={styles}
      sx={{ height: "100vh", width: "100vw", position: "relative" }}
    >
      <DashboardHeader showBackToEditor={!!currentWorkflowId}>
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

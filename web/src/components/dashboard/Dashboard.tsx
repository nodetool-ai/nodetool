/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useState, useEffect, useMemo } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Button,
  ToggleButton,
  ToggleButtonGroup
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Workflow, WorkflowList, Message } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useSettingsStore } from "../../stores/SettingsStore";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { truncateString } from "../../utils/truncateString";
import { DEFAULT_MODEL } from "../../config/constants";
import { client, BASE_URL } from "../../stores/ApiClient";
import { createErrorMessage } from "../../utils/errorHandling";
import ChatView from "../chat/containers/ChatView";
import ExamplesList from "./ExamplesList";
import WorkflowsList from "./WorkflowsList";
import { isEqual } from "lodash";
import RecentChats from "./RecentChats";
import { Thread } from "../../stores/GlobalChatStore";
import DashboardHeader from "./DashboardHeader";
import {
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
  DockviewApi
} from "dockview";
import "dockview/dist/styles/dockview.css";
import AddPanelDropdown from "./AddPanelDropdown";

const styles = (theme: any) =>
  css({
    "&": {
      width: "100vw",
      height: "100vh",
      backgroundColor: theme.palette.background.default,
      overflow: "hidden"
    }
  });

interface PanelProps {
  [key: string]: any;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const settings = useSettingsStore((state) => state.settings);
  const setWorkflowOrder = useSettingsStore((state) => state.setWorkflowOrder);
  const createNewWorkflow = useWorkflowManager((state) => state.createNew);
  const { currentWorkflowId } = useWorkflowManager((state) => ({
    currentWorkflowId: state.currentWorkflowId
  }));
  const loadExamples = useWorkflowManager((state) => state.loadExamples);
  const createWorkflow = useWorkflowManager((state) => state.create);
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
  const [availablePanels, setAvailablePanels] = useState<any[]>([]);

  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const savedModel = localStorage.getItem("selectedModel");
    return savedModel || DEFAULT_MODEL;
  });
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [loadingExampleId, setLoadingExampleId] = useState<string | null>(null);

  const {
    connect,
    disconnect,
    status,
    sendMessage,
    createNewThread,
    switchThread,
    getCurrentMessages,
    progress,
    statusMessage,
    stopGeneration,
    agentMode,
    setAgentMode,
    currentPlanningUpdate,
    currentTaskUpdate,
    threads,
    currentThreadId,
    deleteThread
  } = useGlobalChatStore();

  const messages = getCurrentMessages();

  useEffect(() => {
    localStorage.setItem("selectedModel", selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    if (status === "disconnected") {
      connect().catch((error) => {
        console.error("Failed to connect to chat service:", error);
      });
    }

    return () => {
      disconnect();
    };
  }, []);

  useEffect(() => {
    let reconnectTimer: NodeJS.Timeout | null = null;

    const attemptReconnect = () => {
      if (status === "disconnected" || status === "failed") {
        console.log(
          "Dashboard: Connection lost, attempting automatic reconnect..."
        );
        connect().catch((error) => {
          console.error("Dashboard: Automatic reconnect failed:", error);
        });
      }
    };

    if (status === "disconnected" || status === "failed") {
      reconnectTimer = setTimeout(attemptReconnect, 2000);
    }

    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [status, connect]);

  const loadWorkflows = async () => {
    const { data, error } = await client.GET("/api/workflows/", {
      params: {
        query: {
          cursor: "",
          limit: 20,
          columns: "name,id,updated_at,description,thumbnail_url"
        }
      }
    });
    if (error) {
      throw createErrorMessage(error, "Failed to load workflows");
    }
    return data;
  };

  const { data: workflowsData, isLoading: isLoadingWorkflows } =
    useQuery<WorkflowList>({
      queryKey: ["workflows"],
      queryFn: loadWorkflows
    });

  const { data: examplesData, isLoading: isLoadingExamples } =
    useQuery<WorkflowList>({
      queryKey: ["examples"],
      queryFn: loadExamples
    });

  const startExamples = useMemo(() => {
    return (
      examplesData?.workflows.filter(
        (workflow) =>
          workflow.tags?.includes("start") ||
          workflow.tags?.includes("getting-started")
      ) || []
    );
  }, [examplesData]);

  const sortedWorkflows = useMemo(() => {
    return (
      workflowsData?.workflows.sort((a, b) => {
        if (settings.workflowOrder === "name") {
          return a.name.localeCompare(b.name);
        }
        return b.updated_at.localeCompare(a.updated_at);
      }) || []
    );
  }, [workflowsData, settings.workflowOrder]);

  const handleCreateNewWorkflow = useCallback(async () => {
    const workflow = await createNewWorkflow();
    navigate(`/editor/${workflow.id}`);
  }, [createNewWorkflow, navigate]);

  const handleWorkflowClick = useCallback(
    (workflow: Workflow) => {
      navigate(`/editor/${workflow.id}`);
    },
    [navigate]
  );

  const handleExampleClick = useCallback(
    async (example: Workflow) => {
      if (loadingExampleId) return;

      setLoadingExampleId(example.id);
      try {
        const tags = example.tags || [];
        if (!tags.includes("example")) {
          tags.push("example");
        }

        const req = {
          name: example.name,
          package_name: example.package_name,
          description: example.description,
          tags: tags,
          access: "private",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const newWorkflow = await createWorkflow(
          req,
          example.package_name || undefined,
          example.name
        );
        navigate(`/editor/${newWorkflow.id}`);
      } catch (error) {
        console.error("Error copying example:", error);
        setLoadingExampleId(null);
      }
    },
    [loadingExampleId, createWorkflow, navigate]
  );

  const handleSendMessage = useCallback(
    async (message: Message) => {
      if (!selectedModel) {
        console.error("No model selected");
        return;
      }

      if (status !== "connected" && status !== "reconnecting") {
        console.error("Not connected to chat service");
        return;
      }

      try {
        const messageWithModel = {
          ...message,
          model: selectedModel
        };

        if (status !== "connected") {
          await connect();
        }
        const threadId = createNewThread();
        switchThread(threadId);

        await sendMessage(messageWithModel);
        navigate("/chat");
      } catch (error) {
        console.error("Failed to send message:", error);
      }
    },
    [
      selectedModel,
      sendMessage,
      status,
      connect,
      navigate,
      createNewThread,
      switchThread
    ]
  );

  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModel(modelId);
  }, []);

  const handleOrderChange = useCallback(
    (_: any, newOrder: any) => {
      if (newOrder !== null) {
        setWorkflowOrder(newOrder);
      }
    },
    [setWorkflowOrder]
  );

  const handleViewAllExamples = useCallback(() => {
    navigate("/examples");
  }, [navigate]);

  const handleThreadSelect = useCallback(
    (threadId: string) => {
      switchThread(threadId);
      navigate(`/chat/${threadId}`);
    },
    [switchThread, navigate]
  );

  const handleNewThread = useCallback(() => {
    const newThreadId = createNewThread();
    navigate(`/chat/${newThreadId}`);
  }, [createNewThread, navigate]);

  const getThreadPreview = useCallback(
    (threadId: string) => {
      const thread = threads[threadId];
      if (!thread || thread.messages.length === 0) {
        return "No messages yet";
      }

      const firstUserMessage = thread.messages.find((m) => m.role === "user");
      const preview = firstUserMessage?.content
        ? typeof firstUserMessage.content === "string"
          ? firstUserMessage.content
          : "Chat started"
        : "Chat started";

      return truncateString(preview, 100);
    },
    [threads]
  );

  const handleToolsChange = useCallback((tools: string[]) => {
    setSelectedTools((prev) => (isEqual(prev, tools) ? prev : tools));
  }, []);

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
      threads: (props: IDockviewPanelProps<PanelProps>) => (
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
          progressMessage={props.params?.progressMessage || ""}
          model={props.params?.model || DEFAULT_MODEL}
          selectedTools={props.params?.selectedTools || []}
          onToolsChange={props.params?.onToolsChange || (() => {})}
          onModelChange={props.params?.onModelChange || (() => {})}
          onStop={props.params?.onStop || (() => {})}
          agentMode={props.params?.agentMode || "off"}
          onAgentModeToggle={props.params?.onAgentModeToggle || (() => {})}
          currentPlanningUpdate={props.params?.currentPlanningUpdate || null}
          currentTaskUpdate={props.params?.currentTaskUpdate || null}
        />
      )
    }),
    []
  );

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const { api } = event;
    setDockviewApi(api);

    const examplesPanel = api.addPanel({
      id: "examples",
      component: "examples",
      title: "Examples"
    });

    const workflowsPanel = api.addPanel({
      id: "workflows",
      component: "workflows",
      title: "Recent Workflows",
      position: { direction: "right", referencePanel: examplesPanel }
    });

    api.addPanel({
      id: "threads",
      component: "threads",
      title: "Recent Chats",
      position: { direction: "right", referencePanel: workflowsPanel }
    });

    api.addPanel({
      id: "chat",
      component: "chat",
      title: "Chat",
      position: { direction: "below", referencePanel: examplesPanel }
    });
  }, []);

  useEffect(() => {
    if (!dockviewApi) return;

    const allPanelIds = ["examples", "workflows", "threads", "chat"];
    const openPanelIds = dockviewApi.panels.map((p) => p.id);
    const closedPanels = allPanelIds
      .filter((id) => !openPanelIds.includes(id))
      .map((id) => ({ id, title: id.charAt(0).toUpperCase() + id.slice(1) }));
    setAvailablePanels(closedPanels);

    const disposable = dockviewApi.onDidRemovePanel(() => {
      const openPanelIds = dockviewApi.panels.map((p) => p.id);
      const closedPanels = allPanelIds
        .filter((id) => !openPanelIds.includes(id))
        .map((id) => ({ id, title: id.charAt(0).toUpperCase() + id.slice(1) }));
      setAvailablePanels(closedPanels);
    });

    return () => {
      disposable.dispose();
    };
  }, [dockviewApi, dockviewApi?.panels]);

  const handleAddPanel = (panelId: string) => {
    if (!dockviewApi) return;
    dockviewApi.addPanel({
      id: panelId,
      component: panelId,
      title: panelId.charAt(0).toUpperCase() + panelId.slice(1)
    });
  };

  useEffect(() => {
    if (!dockviewApi) return;

    const panelParams: PanelProps = {
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
      threads: {
        threads: threads as { [key: string]: Thread },
        currentThreadId,
        onNewThread: handleNewThread,
        onSelectThread: handleThreadSelect,
        onDeleteThread: deleteThread,
        getThreadPreview
      },
      chat: {
        status,
        sendMessage: handleSendMessage,
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

    Object.entries(panelParams).forEach(([id, params]) => {
      const panel = dockviewApi.getPanel(id);
      if (panel) {
        panel.update({ params });
      }
    });
  }, [
    dockviewApi,
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
    handleNewThread,
    handleThreadSelect,
    deleteThread,
    getThreadPreview,
    status,
    handleSendMessage,
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

  return (
    <Box sx={{ height: "100vh", width: "100vw", position: "relative" }}>
      <DashboardHeader showBackToEditor={!!currentWorkflowId}>
        <AddPanelDropdown
          availablePanels={availablePanels}
          onAddPanel={handleAddPanel}
        />
      </DashboardHeader>
      <div style={{ height: "calc(100vh - 64px)", top: "64px" }}>
        <DockviewReact
          components={panelComponents}
          onReady={onReady}
          className="dockview-theme-nodetool"
        />
      </div>
    </Box>
  );
};

export default Dashboard;

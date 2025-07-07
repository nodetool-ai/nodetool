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
  IDockviewPanelProps
} from "dockview";
import "dockview/dist/styles/dockview.css";

const styles = (theme: any) =>
  css({
    "&": {
      width: "100vw",
      height: "100vh",
      backgroundColor: theme.palette.background.default,
      overflow: "hidden"
    }
    // The responsive adjustments can also be removed as Dockview handles this.
  });

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

  // Save selectedModel to localStorage
  useEffect(() => {
    localStorage.setItem("selectedModel", selectedModel);
  }, [selectedModel]);

  // Handle WebSocket connection lifecycle
  useEffect(() => {
    // Connect on mount if not already connected
    if (status === "disconnected") {
      connect().catch((error) => {
        console.error("Failed to connect to chat service:", error);
      });
    }

    return () => {
      // Disconnect on unmount
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run on mount/unmount

  // Monitor connection state and reconnect when disconnected or failed
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

    // Check connection state periodically
    if (status === "disconnected" || status === "failed") {
      // Initial reconnect attempt after 2 seconds
      reconnectTimer = setTimeout(attemptReconnect, 2000);
    }

    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [status, connect]);

  // Load workflows
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

  // Filter examples to show only those with "start" tag
  const startExamples =
    examplesData?.workflows.filter(
      (workflow) =>
        workflow.tags?.includes("start") ||
        workflow.tags?.includes("getting-started")
    ) || [];

  // Sort workflows
  const sortedWorkflows =
    workflowsData?.workflows.sort((a, b) => {
      if (settings.workflowOrder === "name") {
        return a.name.localeCompare(b.name);
      }
      return b.updated_at.localeCompare(a.updated_at);
    }) || [];

  const currentWorkflow = workflowsData?.workflows.find(
    (workflow) => workflow.id === currentWorkflowId
  );

  const handleCreateNewWorkflow = async () => {
    const workflow = await createNewWorkflow();
    navigate(`/editor/${workflow.id}`);
  };

  const handleWorkflowClick = (workflow: Workflow) => {
    navigate(`/editor/${workflow.id}`);
  };

  const handleExampleClick = async (example: Workflow) => {
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
  };

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
        // Update the message with the selected model
        const messageWithModel = {
          ...message,
          model: selectedModel
        };

        // Ensure chat is connected
        if (status !== "connected") {
          await connect();
        }
        const threadId = createNewThread();
        switchThread(threadId);

        await sendMessage(messageWithModel);
        // Navigate to chat view
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

  const handleOrderChange = (_: any, newOrder: any) => {
    if (newOrder !== null) {
      setWorkflowOrder(newOrder);
    }
  };

  const handleViewAllExamples = () => {
    navigate("/examples");
  };

  const handleThreadSelect = (threadId: string) => {
    switchThread(threadId);
    navigate(`/chat/${threadId}`);
  };

  const handleNewThread = () => {
    const newThreadId = createNewThread();
    navigate(`/chat/${newThreadId}`);
  };

  const getThreadPreview = (threadId: string) => {
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
  };

  const handleToolsChange = useCallback((tools: string[]) => {
    setSelectedTools((prev) => (isEqual(prev, tools) ? prev : tools));
  }, []);

  const panelComponents = useMemo(
    () => ({
      examples: () => (
        <ExamplesList
          startExamples={startExamples}
          isLoadingExamples={isLoadingExamples}
          loadingExampleId={loadingExampleId}
          handleExampleClick={handleExampleClick}
          handleViewAllExamples={handleViewAllExamples}
        />
      ),
      workflows: () => (
        <WorkflowsList
          sortedWorkflows={sortedWorkflows}
          isLoadingWorkflows={isLoadingWorkflows}
          settings={settings}
          handleOrderChange={handleOrderChange}
          handleCreateNewWorkflow={handleCreateNewWorkflow}
          handleWorkflowClick={handleWorkflowClick}
        />
      ),
      threads: () => (
        <RecentChats
          threads={threads as { [key: string]: Thread }}
          currentThreadId={currentThreadId}
          onNewThread={handleNewThread}
          onSelectThread={handleThreadSelect}
          onDeleteThread={deleteThread}
          getThreadPreview={getThreadPreview}
        />
      ),
      chat: () => (
        <ChatView
          status={status}
          messages={[]}
          sendMessage={handleSendMessage}
          progress={progress.current}
          total={progress.total}
          progressMessage={statusMessage}
          model={selectedModel}
          selectedTools={selectedTools}
          onToolsChange={handleToolsChange}
          onModelChange={handleModelChange}
          onStop={stopGeneration}
          agentMode={agentMode}
          onAgentModeToggle={setAgentMode}
          currentPlanningUpdate={currentPlanningUpdate}
          currentTaskUpdate={currentTaskUpdate}
        />
      )
    }),
    [
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
      progress,
      handleSendMessage,
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
    ]
  );

  const onReady = useCallback((event: any) => {
    const { api } = event;

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

    const threadsPanel = api.addPanel({
      id: "threads",
      component: "threads",
      title: "Recent Chats",
      position: { direction: "below", referencePanel: examplesPanel }
    });

    api.addPanel({
      id: "chat",
      component: "chat",
      title: "Chat",
      position: { direction: "right", referencePanel: threadsPanel }
    });

    // Make the examples panel take up the full width initially
    api.adddGroup(examplesPanel, { direction: "right" });
    api.adddGroup(workflowsPanel, { direction: "below" });
  }, []);

  return (
    <Box sx={{ height: "100vh", width: "100vw", position: "relative" }}>
      <DashboardHeader showBackToEditor={!!currentWorkflowId} />
      <DockviewReact
        components={panelComponents}
        onReady={onReady}
        className="dockview-theme-nodetool" // Assuming a theme, can be adjusted
      />
    </Box>
  );
};

export default Dashboard;

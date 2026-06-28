/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";

import ChatView from "../chat/containers/ChatView";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { Box } from "../ui_primitives";

type ChatViewStatus = React.ComponentProps<typeof ChatView>["status"];

interface AppBuilderAgentPanelProps {
  workflowId: string;
}

/**
 * The in-builder agent chat. Reuses the global agent loop (and its global tool
 * registry), so the agent has both the app tools (`ui_app_*`) and the workflow
 * tools (`ui_*`) at once. Bound to a workflow thread so runs and graph edits
 * target this workflow.
 */
const AppBuilderAgentPanel: React.FC<AppBuilderAgentPanelProps> = ({
  workflowId
}) => {
  const {
    status,
    progress,
    statusMessage,
    currentThreadId,
    runningToolCallId,
    runningToolMessage,
    currentPlanningUpdate,
    currentTaskUpdate,
    currentLogUpdate,
    selectedModel
  } = useGlobalChatStore(
    useShallow((state) => ({
      status: state.status,
      progress: state.progress,
      statusMessage: state.statusMessage,
      currentThreadId: state.currentThreadId,
      runningToolCallId: state.currentRunningToolCallId,
      runningToolMessage: state.currentToolMessage,
      currentPlanningUpdate: state.currentPlanningUpdate,
      currentTaskUpdate: state.currentTaskUpdate,
      currentLogUpdate: state.currentLogUpdate,
      selectedModel: state.selectedModel
    }))
  );

  const {
    connect,
    openWorkflowThread,
    sendMessage,
    stopGeneration,
    createNewThread,
    setSelectedModel,
    getCurrentMessagesSync
  } = useGlobalChatStore(
    useShallow((state) => ({
      connect: state.connect,
      openWorkflowThread: state.openWorkflowThread,
      sendMessage: state.sendMessage,
      stopGeneration: state.stopGeneration,
      createNewThread: state.createNewThread,
      setSelectedModel: state.setSelectedModel,
      getCurrentMessagesSync: state.getCurrentMessagesSync
    }))
  );

  // Connect and bind a thread to this workflow so the agent's runs and graph
  // edits target it.
  useEffect(() => {
    let cancelled = false;
    connect()
      .then(() => {
        if (!cancelled) return openWorkflowThread(workflowId);
      })
      .catch((err) => {
        console.error("AppBuilder agent: failed to connect", err);
      });
    return () => {
      cancelled = true;
    };
  }, [connect, openWorkflowThread, workflowId]);

  const handleNewChat = useCallback(async () => {
    await createNewThread();
    await openWorkflowThread(workflowId);
  }, [createNewThread, openWorkflowThread, workflowId]);

  const messages = getCurrentMessagesSync();
  const viewStatus: ChatViewStatus =
    status === "stopping" ? "loading" : (status as ChatViewStatus);

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0
      }}
    >
      <ChatView
        status={viewStatus}
        messages={messages}
        sendMessage={sendMessage}
        progress={progress.current}
        total={progress.total}
        progressMessage={statusMessage}
        runningToolCallId={runningToolCallId}
        runningToolMessage={runningToolMessage}
        model={selectedModel}
        onModelChange={setSelectedModel}
        onStop={stopGeneration}
        onNewChat={handleNewChat}
        currentPlanningUpdate={currentPlanningUpdate}
        currentTaskUpdate={currentTaskUpdate}
        currentLogUpdate={currentLogUpdate}
        workflowId={workflowId}
        workflowAssistant
        composerVariant="media"
        composerPlaceholder="Ask the agent to build your app or edit the workflow…"
        key={currentThreadId ?? "no-thread"}
      />
    </Box>
  );
};

export default AppBuilderAgentPanel;

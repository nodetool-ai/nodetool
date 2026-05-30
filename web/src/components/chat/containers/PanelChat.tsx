/** @jsxImportSource @emotion/react */
import { memo, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import ChatView from "./ChatView";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { useWorkflowManager } from "../../../contexts/WorkflowManagerContext";
import { AlertBanner, Caption, FlexColumn, Text } from "../../ui_primitives";

/**
 * PanelChat — the unified chat for the editor's left side panel.
 *
 * Renders the same smooth `ChatView` as the global chat, but binds the
 * conversation to the currently open workflow: each workflow gets its own
 * thread, so switching workflows switches the conversation. The composer's
 * mode selector exposes chat, media generation, and the Pi agent; the `ui_*`
 * workflow tools target the open workflow in every mode.
 */
const PanelChat: React.FC = () => {
  const currentWorkflowId = useWorkflowManager(
    (state) => state.currentWorkflowId
  );

  const {
    status,
    progress,
    statusMessage,
    error,
    currentLogUpdate,
    currentThreadId,
    selectedModel,
    setSelectedModel,
    memoryEnabled,
    setMemoryEnabled,
    currentPlanningUpdate,
    currentTaskUpdate,
    currentTaskUpdateThreadId,
    lastTaskUpdatesByThread,
    workflowId,
    runningToolCallId,
    runningToolMessage,
    sendMessage,
    stopGeneration,
    connect,
    openWorkflowThread,
    getCurrentMessagesSync
  } = useGlobalChatStore(
    useShallow((s) => ({
      status: s.status,
      progress: s.progress,
      statusMessage: s.statusMessage,
      error: s.error,
      currentLogUpdate: s.currentLogUpdate,
      currentThreadId: s.currentThreadId,
      selectedModel: s.selectedModel,
      setSelectedModel: s.setSelectedModel,
      memoryEnabled: s.memoryEnabled,
      setMemoryEnabled: s.setMemoryEnabled,
      currentPlanningUpdate: s.currentPlanningUpdate,
      currentTaskUpdate: s.currentTaskUpdate,
      currentTaskUpdateThreadId: s.currentTaskUpdateThreadId,
      lastTaskUpdatesByThread: s.lastTaskUpdatesByThread,
      workflowId: s.workflowId,
      runningToolCallId: s.currentRunningToolCallId,
      runningToolMessage: s.currentToolMessage,
      sendMessage: s.sendMessage,
      stopGeneration: s.stopGeneration,
      connect: s.connect,
      openWorkflowThread: s.openWorkflowThread,
      getCurrentMessagesSync: s.getCurrentMessagesSync
    }))
  );

  // Ensure the shared chat socket is up. Intentionally no disconnect on
  // unmount — the socket is a singleton shared across surfaces, and tearing it
  // down when the panel collapses would drop in-flight generations.
  useEffect(() => {
    connect().catch((err) => {
      console.error("Failed to connect chat:", err);
    });
  }, [connect]);

  // Bind the conversation to the open workflow.
  useEffect(() => {
    if (!currentWorkflowId) {
      return;
    }
    openWorkflowThread(currentWorkflowId).catch((err) => {
      console.error("Failed to open workflow thread:", err);
    });
  }, [currentWorkflowId, openWorkflowThread]);

  const messages = getCurrentMessagesSync();

  const taskUpdateForDisplay = useMemo(() => {
    if (!currentThreadId) {
      return null;
    }
    if (currentTaskUpdate && currentTaskUpdateThreadId === currentThreadId) {
      return currentTaskUpdate;
    }
    return lastTaskUpdatesByThread[currentThreadId] ?? null;
  }, [
    currentThreadId,
    currentTaskUpdate,
    currentTaskUpdateThreadId,
    lastTaskUpdatesByThread
  ]);

  const chatStatus = status === "stopping" ? "loading" : status;

  const placeholder = useMemo(
    () => (
      <FlexColumn
        align="center"
        justify="center"
        gap={1}
        sx={{ height: "100%", px: 3, textAlign: "center" }}
      >
        <Text size="normal" weight={500} family="secondary">
          Workflow chat
        </Text>
        <Caption size="small">
          Ask me to build or edit this workflow, generate media, or switch to
          the Pi agent. I can control nodes, connections, and runs directly.
        </Caption>
      </FlexColumn>
    ),
    []
  );

  return (
    <FlexColumn
      className="panel-chat"
      fullWidth
      fullHeight
      sx={{ overflow: "hidden", minHeight: 0 }}
    >
      {error && (
        <AlertBanner severity="error" sx={{ m: 1, flexShrink: 0 }}>
          {error}
        </AlertBanner>
      )}
      <ChatView
        status={chatStatus}
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
        memoryEnabled={memoryEnabled}
        onMemoryToggle={setMemoryEnabled}
        currentPlanningUpdate={currentPlanningUpdate}
        currentTaskUpdate={taskUpdateForDisplay}
        currentLogUpdate={currentLogUpdate}
        workflowId={workflowId}
        requireToolSupport
        noMessagesPlaceholder={error ? undefined : placeholder}
      />
    </FlexColumn>
  );
};

export default memo(PanelChat);

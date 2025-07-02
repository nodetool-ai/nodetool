/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useEffect, useState } from "react";
import ChatView from "../chat/containers/ChatView";
import { DEFAULT_MODEL } from "../../config/constants";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { Message } from "../../stores/ApiTypes";
import { NewChatButton } from "../chat/thread/NewChatButton";
import { Dialog, DialogContent, IconButton, Tooltip } from "@mui/material";
import ListIcon from "@mui/icons-material/List";
import ThreadList from "../chat/thread/ThreadList";
import { useNodes } from "../../contexts/NodeContext";
import { reactFlowEdgeToGraphEdge } from "../../stores/reactFlowEdgeToGraphEdge";
import { reactFlowNodeToGraphNode } from "../../stores/reactFlowNodeToGraphNode";
import { useWorkflowGraphUpdater } from "../../hooks/useWorkflowGraphUpdater";
import SvgFileIcon from "../SvgFileIcon";

const containerStyles = css({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  overflow: "hidden",
  marginRight: "1em",
  ".chat-view": {
    height: "calc(100% - 45px)"
  },
  ".chat-thread-view": {
    paddingBottom: "4em"
  },
  ".chat-input-section": {
    backgroundColor: "transparent"
  },
  ".chat-controls": {
    flexDirection: "column",
    gap: "0",
    alignItems: "flex-start"
  },
  ".chat-composer-wrapper": {
    width: "100%",
    ".compose-message": {
      margin: "0 .5em 0 0"
    }
  }
});

/**
 * WorkflowAssistantChat embeds a ChatView that is automatically scoped to the
 * currently active workflow and with help mode enabled by default.
 */
const WorkflowAssistantChat: React.FC = () => {
  const {
    connect,
    disconnect,
    status,
    sendMessage,
    progress,
    statusMessage,
    error,
    stopGeneration,
    getCurrentMessages,
    createNewThread,
    currentThreadId,
    threads,
    switchThread,
    deleteThread
  } = useGlobalChatStore();

  // Subscribe to workflow graph updates from chat messages
  useWorkflowGraphUpdater();

  const messages = getCurrentMessages();
  const total = progress.total;
  const { nodes, edges } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges
  }));

  // Local UI state (model & toggles)
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const saved = localStorage.getItem("selectedModel");
    return saved || DEFAULT_MODEL;
  });
  const [selectedTools] = useState<string[]>([]); // immutable; no selector UI
  const [selectedCollections] = useState<string[]>([]);

  // Modal state for thread list
  const [isThreadListOpen, setIsThreadListOpen] = useState(false);

  // Handlers for thread actions
  const handleNewChat = useCallback(() => {
    createNewThread();
    setIsThreadListOpen(false);
  }, [createNewThread]);

  const handleSelectThread = useCallback(
    (id: string) => {
      switchThread(id);
      setIsThreadListOpen(false);
    },
    [switchThread]
  );

  const handleDeleteThread = useCallback(
    (id: string) => {
      deleteThread(id);
    },
    [deleteThread]
  );

  const getThreadPreview = useCallback(
    (threadId: string) => {
      if (!threads) return "Loading...";
      const thread = threads[threadId];
      if (!thread || thread.messages.length === 0) {
        return "Empty conversation";
      }

      const firstUserMessage = thread.messages.find(
        (msg) => msg.role === "user"
      );
      if (firstUserMessage) {
        const content =
          typeof firstUserMessage.content === "string"
            ? firstUserMessage.content
            : Array.isArray(firstUserMessage.content) &&
              firstUserMessage.content[0]?.type === "text"
            ? (firstUserMessage.content[0] as any).text
            : "[Media message]";
        return content?.substring(0, 50) + (content?.length > 50 ? "..." : "");
      }

      return "New conversation";
    },
    [threads]
  );

  // Connect once on mount and clean up on unmount
  useEffect(() => {
    connect().catch((err) => console.error("Failed to connect:", err));
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ensure a thread exists after connection
  useEffect(() => {
    if (!currentThreadId && status === "connected") {
      createNewThread();
    }
  }, [currentThreadId, status, createNewThread]);

  const handleSendMessage = useCallback(
    async (message: Message) => {
      await sendMessage(message);
    },
    [sendMessage]
  );

  // Placeholder content shown when the assistant chat has no messages yet.
  const AssistantWelcome: React.FC = () => (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "1.5em"
      }}
    >
      <SvgFileIcon
        wrapperStyle=" color: 'var(--c_hl)' "
        iconName="assistant"
        svgProp={{
          width: 44,
          height: 44,
          opacity: 0.4,
          color: "var(--palette-primary-main)"
        }}
      />
      <h2 style={{ fontFamily: "var(--fontFamily2)", color: "var(--c_hl2)" }}>
        OPERATOR
      </h2>
      <p>
        Ask me questions about your workflow or describe what you want to do.
      </p>
    </div>
  );

  return (
    <div className="workflow-assistant-chat" css={containerStyles}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: "0.5em",
          padding: "4px 8px"
        }}
      >
        <Tooltip title="Chat History">
          <IconButton onClick={() => setIsThreadListOpen(true)} size="small">
            <ListIcon />
          </IconButton>
        </Tooltip>
        <NewChatButton onNewThread={createNewThread} />
      </div>
      {/* Thread List Modal */}
      <Dialog
        open={isThreadListOpen}
        onClose={() => setIsThreadListOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogContent style={{ padding: 0, height: "70vh" }}>
          <ThreadList
            threads={threads}
            currentThreadId={currentThreadId}
            onNewThread={handleNewChat}
            onSelectThread={handleSelectThread}
            onDeleteThread={handleDeleteThread}
            getThreadPreview={getThreadPreview}
          />
        </DialogContent>
      </Dialog>
      {error && (
        <div style={{ color: "var(--palette-error-main)", padding: "0.5rem" }}>
          {error}
        </div>
      )}
      <ChatView
        status={status}
        progress={progress.current}
        total={total}
        messages={messages}
        sendMessage={sendMessage}
        progressMessage={statusMessage}
        model={selectedModel}
        selectedTools={selectedTools}
        selectedCollections={selectedCollections}
        onModelChange={setSelectedModel}
        helpMode={true}
        workflowAssistant={true}
        onStop={stopGeneration}
        noMessagesPlaceholder={<AssistantWelcome />}
        graph={{
          nodes: nodes.map(reactFlowNodeToGraphNode),
          edges: edges.map(reactFlowEdgeToGraphEdge)
        }}
      />
    </div>
  );
};

export default WorkflowAssistantChat;

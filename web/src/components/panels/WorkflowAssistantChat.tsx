/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useContext, useEffect, useState } from "react";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import ChatView from "../chat/containers/ChatView";
import { DEFAULT_MODEL } from "../../config/constants";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { LanguageModel, Message, Workflow } from "../../stores/ApiTypes";
import { NewChatButton } from "../chat/thread/NewChatButton";
import { Dialog, DialogContent, IconButton, Tooltip } from "@mui/material";
import ListIcon from "@mui/icons-material/List";
import ThreadList from "../chat/thread/ThreadList";
import type { ThreadInfo } from "../chat/thread";
import { useNodes, NodeContext } from "../../contexts/NodeContext";
import { reactFlowEdgeToGraphEdge } from "../../stores/reactFlowEdgeToGraphEdge";
import { reactFlowNodeToGraphNode } from "../../stores/reactFlowNodeToGraphNode";
import { useWorkflowGraphUpdater } from "../../hooks/useWorkflowGraphUpdater";
import { useEnsureChatConnected } from "../../hooks/useEnsureChatConnected";
import SvgFileIcon from "../SvgFileIcon";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import useMetadataStore from "../../stores/MetadataStore";

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
    alignItems: "center"
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
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down("sm"));
  const {
    status,
    sendMessage,
    progress,
    statusMessage,
    error,
    stopGeneration,
    getCurrentMessagesSync,
    createNewThread,
    currentThreadId,
    threads,
    switchThread,
    deleteThread,
    messageCache
  } = useGlobalChatStore();

  // Get the node store from context
  const nodeStore = useContext(NodeContext);
  const {
    currentWorkflowId,
    getWorkflow,
    addWorkflow,
    removeWorkflow,
    getNodeStore,
    updateWorkflow,
    saveWorkflow,
    getCurrentWorkflow,
    setCurrentWorkflowId,
    fetchWorkflow,
    newWorkflow,
    createNew,
    searchTemplates,
    copy
  } = useWorkflowManager((state) => ({
    currentWorkflowId: state.currentWorkflowId,
    getWorkflow: state.getWorkflow,
    addWorkflow: state.addWorkflow,
    removeWorkflow: state.removeWorkflow,
    getNodeStore: state.getNodeStore,
    updateWorkflow: state.updateWorkflow,
    saveWorkflow: state.saveWorkflow,
    getCurrentWorkflow: state.getCurrentWorkflow,
    setCurrentWorkflowId: state.setCurrentWorkflowId,
    fetchWorkflow: state.fetchWorkflow,
    newWorkflow: state.newWorkflow,
    createNew: state.createNew,
    searchTemplates: state.searchTemplates,
    copy: state.copy
  }));
  const nodeMetadata = useMetadataStore((state) => state.metadata);
  const setFrontendToolState = useGlobalChatStore(
    (state) => state.setFrontendToolState
  );

  useEffect(() => {
    setFrontendToolState({
      nodeMetadata: nodeMetadata,
      currentWorkflowId: currentWorkflowId,
      getWorkflow: getWorkflow,
      addWorkflow: addWorkflow,
      removeWorkflow: removeWorkflow,
      getNodeStore: getNodeStore,
      updateWorkflow: updateWorkflow,
      saveWorkflow: saveWorkflow,
      getCurrentWorkflow: getCurrentWorkflow,
      setCurrentWorkflowId: setCurrentWorkflowId,
      fetchWorkflow: fetchWorkflow,
      newWorkflow: newWorkflow,
      createNew: createNew,
      searchTemplates: searchTemplates,
      copy: copy
    });
  }, [
    nodeMetadata,
    getWorkflow,
    addWorkflow,
    removeWorkflow,
    getNodeStore,
    updateWorkflow,
    saveWorkflow,
    getCurrentWorkflow,
    setCurrentWorkflowId,
    fetchWorkflow,
    newWorkflow,
    createNew,
    searchTemplates,
    copy,
    setFrontendToolState,
    currentWorkflowId
  ]);

  // Subscribe to workflow graph updates from chat messages
  useWorkflowGraphUpdater();

  const total = progress.total;
  const { nodes, edges } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges
  }));

  // Get messages from store
  const messages = getCurrentMessagesSync();

  const tryParseModel = (model: string) => {
    try {
      return JSON.parse(model);
    } catch (error) {
      return DEFAULT_MODEL;
    }
  };

  // Local UI state (model & toggles)
  const [selectedModel, setSelectedModel] = useState<LanguageModel>(() => {
    const saved = localStorage.getItem("selectedModel");
    return saved ? tryParseModel(saved) : DEFAULT_MODEL;
  });

  // Modal state for thread list
  const [isThreadListOpen, setIsThreadListOpen] = useState(false);

  // Handlers for thread actions
  const handleNewChat = useCallback(() => {
    createNewThread()
      .then((newThreadId) => {
        switchThread(newThreadId);
        setIsThreadListOpen(false);
      })
      .catch((error) => {
        console.error("Failed to create new thread:", error);
      });
  }, [createNewThread, switchThread]);

  const handleSelectThread = useCallback(
    (id: string) => {
      switchThread(id);
      setIsThreadListOpen(false);
    },
    [switchThread]
  );

  const handleDeleteThread = useCallback(
    (id: string) => {
      deleteThread(id).catch((error) => {
        console.error("Failed to delete thread:", error);
      });
    },
    [deleteThread]
  );

  const getThreadPreview = useCallback(
    (threadId: string) => {
      if (!threads) return "Loading...";
      const thread = threads[threadId];
      if (!thread) {
        return "Empty conversation";
      }

      // Use thread title if available
      if (thread.title) {
        return thread.title;
      }

      // Check if we have cached messages for this thread
      const threadMessages = messageCache[threadId];
      if (!threadMessages || threadMessages.length === 0) {
        return "New conversation";
      }

      const firstUserMessage = threadMessages.find(
        (msg: Message) => msg.role === "user"
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
    [threads, messageCache]
  );

  // Ensure chat connection while assistant chat is visible (with nodeStore)
  useEnsureChatConnected({ nodeStore: nodeStore || null });

  // Ensure a thread exists after connection
  useEffect(() => {
    if (!currentThreadId && status === "connected") {
      createNewThread()
        .then((newThreadId) => {
          switchThread(newThreadId);
        })
        .catch((error) => {
          console.error("Failed to create new thread:", error);
        });
    }
  }, [currentThreadId, status, createNewThread, switchThread]);

  const handleSendMessage = useCallback(
    async (message: Message) => {
      await sendMessage(message);
    },
    [sendMessage]
  );

  // Map status to ChatView compatible status
  const getChatViewStatus = () => {
    if (status === "stopping") return "loading";
    return status;
  };

  // Create ThreadInfo-compatible data for ThreadList
  const threadsWithMessages: Record<string, ThreadInfo> = Object.fromEntries(
    Object.entries(threads).map(([id, thread]) => [
      id,
      {
        id: thread.id,
        title: thread.title ?? undefined,
        updatedAt: thread.updated_at,
        messages: messageCache[id] || []
      }
    ])
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
          opacity: 0.8,
          color: "var(--palette-primary-main)"
        }}
      />
      <h2 style={{ fontFamily: "var(--fontFamily2)", color: "var(--c_hl2)" }}>
        OPERATOR
      </h2>
      <p>Ask questions about your workflow or describe what you want to do.</p>
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
        <NewChatButton onNewThread={handleNewChat} />
        <Tooltip title="Chat History">
          <IconButton onClick={() => setIsThreadListOpen(true)} size="small">
            <ListIcon />
          </IconButton>
        </Tooltip>
      </div>
      {/* Thread List Modal */}
      <Dialog
        open={isThreadListOpen}
        onClose={() => setIsThreadListOpen(false)}
        maxWidth="xs"
        fullWidth
        transitionDuration={isSmall ? 0 : undefined}
        slotProps={{
          backdrop: {
            style: {
              backdropFilter: isSmall ? "none" : theme.vars.palette.glass.blur,
              backgroundColor: isSmall
                ? theme.vars.palette.background.default
                : theme.vars.palette.glass.backgroundDialog
            }
          },
          paper: {
            style: {
              borderRadius: theme.vars.rounded.dialog,
              background: theme.vars.palette.glass.backgroundDialogContent
            }
          }
        }}
        sx={{
          "& .MuiDialog-paper": {
            margin: "auto",
            borderRadius: 1.5,
            background: "transparent",
            border: `1px solid ${theme.vars.palette.grey[700]}`
          }
        }}
      >
        <DialogContent style={{ padding: 0, height: "70vh" }}>
          <ThreadList
            threads={threadsWithMessages}
            currentThreadId={currentThreadId}
            onNewThread={handleNewChat}
            onSelectThread={handleSelectThread}
            onDeleteThread={handleDeleteThread}
            getThreadPreview={getThreadPreview}
          />
        </DialogContent>
      </Dialog>
      {error && (
        <div
          className="error-message"
          style={{
            position: "absolute",
            top: "140px",
            left: "50%",
            width: "100%",
            height: "fit-content",
            minWidth: "200px",
            minHeight: "30px",
            transform: "translate(-50%, -50%)",
            zIndex: 99
          }}
        >
          {error}
        </div>
      )}
      <ChatView
        status={getChatViewStatus()}
        progress={progress.current}
        total={total}
        messages={messages}
        sendMessage={sendMessage}
        progressMessage={statusMessage}
        model={selectedModel}
        selectedTools={[]}
        selectedCollections={[]}
        onModelChange={setSelectedModel}
        helpMode={true}
        workflowAssistant={true}
        onStop={stopGeneration}
        onNewChat={handleNewChat}
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

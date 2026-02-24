/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useEffect, useState, useMemo, memo } from "react";
import { IconButton, Tooltip, Button, Popover } from "@mui/material";
import ListIcon from "@mui/icons-material/List";
import AddIcon from "@mui/icons-material/Add";
import ChatView from "../chat/containers/ChatView";
import { NewChatButton } from "../chat/thread/NewChatButton";
import ThreadList from "../chat/thread/ThreadList";
import type { ThreadInfo } from "../chat/thread";
import SvgFileIcon from "../SvgFileIcon";
import PanelHeadline from "../ui/PanelHeadline";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { LanguageModel, Message, Workflow } from "../../stores/ApiTypes";
import { useNodes } from "../../contexts/NodeContext";
import { useLanguageModelsByProvider } from "../../hooks/useModelsByProvider";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import useMetadataStore from "../../stores/MetadataStore";

const containerStyles = css({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  overflow: "hidden",
  padding: "0 1em",
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

const extractFirstTextContent = (message: Message): string | null => {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (!Array.isArray(message.content)) {
    return null;
  }

  for (const block of message.content) {
    if (
      typeof block === "object" &&
      block !== null &&
      "type" in block &&
      block.type === "text" &&
      "text" in block &&
      typeof block.text === "string"
    ) {
      return block.text;
    }
  }

  return null;
};

/**
 * WorkflowAssistantChat embeds a ChatView scoped to the current workflow.
 * It supports only "talk to a workflow" mode (no agent/help mode behavior).
 */
const WorkflowAssistantChat: React.FC = () => {
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
    messageCache,
    currentRunningToolCallId,
    currentToolMessage,
    selectedModel,
    setSelectedModel,
    setAgentMode,
    setSelectedTools,
    setSelectedCollections
  } = useGlobalChatStore(
    useMemo(
      () => (state) => ({
        status: state.status,
        sendMessage: state.sendMessage,
        progress: state.progress,
        statusMessage: state.statusMessage,
        error: state.error,
        stopGeneration: state.stopGeneration,
        getCurrentMessagesSync: state.getCurrentMessagesSync,
        createNewThread: state.createNewThread,
        currentThreadId: state.currentThreadId,
        threads: state.threads,
        switchThread: state.switchThread,
        deleteThread: state.deleteThread,
        messageCache: state.messageCache,
        currentRunningToolCallId: state.currentRunningToolCallId,
        currentToolMessage: state.currentToolMessage,
        selectedModel: state.selectedModel,
        setSelectedModel: state.setSelectedModel,
        setAgentMode: state.setAgentMode,
        setSelectedTools: state.setSelectedTools,
        setSelectedCollections: state.setSelectedCollections
      }),
      []
    )
  );

  const currentWorkflowId = useWorkflowManager((state) => state.currentWorkflowId);
  const getNodeStore = useWorkflowManager((state) => state.getNodeStore);
  const getWorkflow = useWorkflowManager((state) => state.getWorkflow);
  const nodeMetadata = useMetadataStore((state) => state.metadata);

  // Force workflow-only behavior in this panel.
  useEffect(() => {
    setAgentMode(false);
    setSelectedTools([]);
    setSelectedCollections([]);
  }, [setAgentMode, setSelectedTools, setSelectedCollections]);

  const total = progress.total;
  const nodes = useNodes((state) => state.nodes);

  // Get messages from store
  const messages = getCurrentMessagesSync();

  // Popover state for thread list
  const [threadListAnchorEl, setThreadListAnchorEl] =
    useState<HTMLButtonElement | null>(null);
  const isThreadListOpen = Boolean(threadListAnchorEl);

  const messageInputNames = useMemo(() => {
    if (!nodes || nodes.length === 0) {
      return [] as string[];
    }
    const names: string[] = [];
    for (const node of nodes) {
      const data = (node.data ?? {}) as Record<string, unknown>;
      const properties =
        typeof data.properties === "object" && data.properties !== null
          ? (data.properties as Record<string, unknown>)
          : {};
      const nodeType =
        typeof data.type === "string"
          ? data.type
          : typeof data.originalType === "string"
            ? data.originalType
            : typeof properties.type === "string"
              ? properties.type
          : typeof node.type === "string"
            ? node.type
            : "";
      const nodeName =
        typeof properties.name === "string"
          ? properties.name.trim()
          : typeof data.name === "string"
            ? data.name.trim()
            : "";
      if (!nodeName) {
        continue;
      }
      if (
        nodeType === "MessageInput" ||
        nodeType === "nodetool.input.MessageInput" ||
        nodeType.endsWith(".MessageInput")
      ) {
        names.push(nodeName);
      }
    }
    return Array.from(new Set(names));
  }, [nodes]);

  const messageListInputNames = useMemo(() => {
    if (!nodes || nodes.length === 0) {
      return [] as string[];
    }
    const names: string[] = [];
    for (const node of nodes) {
      const data = (node.data ?? {}) as Record<string, unknown>;
      const properties =
        typeof data.properties === "object" && data.properties !== null
          ? (data.properties as Record<string, unknown>)
          : {};
      const nodeType =
        typeof data.type === "string"
          ? data.type
          : typeof data.originalType === "string"
            ? data.originalType
            : typeof properties.type === "string"
              ? properties.type
          : typeof node.type === "string"
            ? node.type
            : "";
      const nodeName =
        typeof properties.name === "string"
          ? properties.name.trim()
          : typeof data.name === "string"
            ? data.name.trim()
            : "";
      if (!nodeName) {
        continue;
      }
      if (
        nodeType === "MessageListInput" ||
        nodeType === "nodetool.input.MessageListInput" ||
        nodeType.endsWith(".MessageListInput")
      ) {
        names.push(nodeName);
      }
    }
    return Array.from(new Set(names));
  }, [nodes]);

  const hasMessageInput =
    messageInputNames.length > 0 || messageListInputNames.length > 0;

  const currentWorkflowToolId = useMemo(() => {
    if (!currentWorkflowId) {
      return null;
    }
    const workflow = getWorkflow(currentWorkflowId) as Workflow | undefined;
    const toolName = workflow?.tool_name;
    if (!toolName) {
      return null;
    }
    return `workflow_${toolName}`;
  }, [currentWorkflowId, getWorkflow]);

  const { models: approvedModels } = useLanguageModelsByProvider({
    allowedProviders: ["OpenAI", "MiniMax", "Anthropic", "Google", "Gemini"]
  });

  useEffect(() => {
    if (approvedModels.length > 0) {
      const isApproved = approvedModels.some(
        (m: LanguageModel) =>
          m.id === selectedModel.id &&
          m.provider.toLowerCase() === selectedModel.provider?.toLowerCase()
      );
      if (!isApproved) {
        // Fallback to first approved model (usually gpt-4o if available)
        const fallback =
          approvedModels.find((m: LanguageModel) => m.id === "gpt-4o") ||
          approvedModels[0];
        if (fallback) {
          setSelectedModel({
            type: "language_model",
            id: fallback.id,
            provider: fallback.provider,
            name: fallback.name || fallback.id
          });
        }
      }
    }
  }, [approvedModels, selectedModel.id, selectedModel.provider, setSelectedModel]);

  // Handlers for thread actions
  const handleNewChat = useCallback(() => {
    createNewThread()
      .then((newThreadId) => {
        switchThread(newThreadId);
        setThreadListAnchorEl(null);
      })
      .catch((createError) => {
        console.error("Failed to create new thread:", createError);
      });
  }, [createNewThread, switchThread]);

  const handleSelectThread = useCallback(
    (id: string) => {
      switchThread(id);
      setThreadListAnchorEl(null);
    },
    [switchThread]
  );

  const handleOpenThreadList = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      setThreadListAnchorEl(event.currentTarget);
    },
    []
  );

  const handleCloseThreadList = useCallback(() => {
    setThreadListAnchorEl(null);
  }, []);

  const handleDeleteThread = useCallback(
    (id: string) => {
      deleteThread(id).catch((deleteError) => {
        console.error("Failed to delete thread:", deleteError);
      });
    },
    [deleteThread]
  );

  const getThreadPreview = useCallback(
    (threadId: string) => {
      if (!threads) {
        return "Loading...";
      }
      const thread = threads[threadId];
      if (!thread) {
        return "Empty conversation";
      }

      if (thread.title) {
        return thread.title;
      }

      const threadMessages = messageCache[threadId];
      if (!threadMessages || threadMessages.length === 0) {
        return "New conversation";
      }

      const firstUserMessage = threadMessages.find(
        (msg: Message) => msg.role === "user"
      );
      if (firstUserMessage) {
        const content = extractFirstTextContent(firstUserMessage);
        if (!content) {
          return "[Media message]";
        }
        return content.substring(0, 50) + (content.length > 50 ? "..." : "");
      }

      return "New conversation";
    },
    [threads, messageCache]
  );

  // Ensure a thread exists
  useEffect(() => {
    if (!currentThreadId && status === "connected") {
      createNewThread()
        .then((newThreadId) => {
          switchThread(newThreadId);
        })
        .catch((createError) => {
          console.error("Failed to create new thread:", createError);
        });
    }
  }, [currentThreadId, status, createNewThread, switchThread]);

  const handleSendMessage = useCallback(
    async (message: Message) => {
      const enrichedMessage = (hasMessageInput
        ? {
            ...message,
            workflow_id: currentWorkflowId ?? undefined,
            workflow_target: "workflow"
          }
        : {
            ...message,
            workflow_id: currentWorkflowId ?? undefined,
            ...(currentWorkflowToolId
              ? { tools: [currentWorkflowToolId] }
              : {})
          }) as Message;
      const enrichedMessageWithInputNames = enrichedMessage as Message & {
        workflow_message_input_name?: string;
        workflow_messages_input_name?: string;
      };
      if (messageInputNames.length > 0) {
        enrichedMessageWithInputNames.workflow_message_input_name =
          messageInputNames[0];
      }
      if (messageListInputNames.length > 0) {
        enrichedMessageWithInputNames.workflow_messages_input_name =
          messageListInputNames[0];
      }
      await sendMessage(enrichedMessage);
    },
    [
      sendMessage,
      currentWorkflowId,
      hasMessageInput,
      currentWorkflowToolId,
      messageInputNames,
      messageListInputNames
    ]
  );

  // Add MessageInput node to workflow
  const handleAddMessageInput = useCallback(() => {
    const workflowId = currentWorkflowId;
    if (!workflowId) {
      console.error("No current workflow ID");
      return;
    }
    const currentNodeStore = getNodeStore(workflowId);
    if (!currentNodeStore) {
      console.error("No node store found for current workflow");
      return;
    }

    const metadata = nodeMetadata["nodetool.input.MessageInput"];
    if (!metadata) {
      console.error("MessageInput node metadata not found");
      return;
    }

    const store = currentNodeStore.getState();

    const position = {
      x: 100 + Math.random() * 200,
      y: 100 + Math.random() * 200
    };

    const newNode = store.createNode(metadata, position, {
      name: "message"
    });

    store.addNode(newNode);
  }, [currentWorkflowId, getNodeStore, nodeMetadata]);

  // Map status to ChatView compatible status
  const getChatViewStatus = () => {
    if (status === "stopping") {
      return "loading";
    }
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

  const WorkflowChatWelcome: React.FC = () => (
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
        iconName="chat"
        svgProp={{
          width: 44,
          height: 44,
          opacity: 0.8,
          color: "var(--palette-primary-main)"
        }}
      />
      <h2 style={{ fontFamily: "var(--fontFamily2)", color: "var(--c_hl2)" }}>
        WORKFLOW CHAT
      </h2>
      <p>
        Chat with your workflow. Set <code>run_mode</code> to <code>chat</code> in workflow
        settings.
      </p>
      <p
        style={{
          fontSize: "0.85em",
          color: "var(--palette-grey-400)",
          marginTop: "1em",
          maxWidth: "320px"
        }}
      >
        Messages are sent to your workflow&apos;s MessageInput/MessageListInput nodes.
      </p>
      {!hasMessageInput && (
        <Button
          onClick={handleAddMessageInput}
          size="small"
          variant="outlined"
          color="primary"
          startIcon={<AddIcon />}
          sx={{
            marginTop: "1.5em",
            textTransform: "none"
          }}
        >
          Add Message Input
        </Button>
      )}
    </div>
  );

  return (
    <div className="workflow-assistant-chat" css={containerStyles}>
      <PanelHeadline title="Workflow Chat" />
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
          <IconButton onClick={handleOpenThreadList} size="small">
            <ListIcon />
          </IconButton>
        </Tooltip>

        <Popover
          open={isThreadListOpen}
          anchorEl={threadListAnchorEl}
          onClose={handleCloseThreadList}
          anchorOrigin={{
            vertical: "bottom",
            horizontal: "right"
          }}
          transformOrigin={{
            vertical: "top",
            horizontal: "right"
          }}
          slotProps={{
            paper: {
              sx: {
                width: 320,
                maxHeight: "70vh",
                borderRadius: 2,
                overflow: "hidden"
              }
            }
          }}
        >
          <ThreadList
            threads={threadsWithMessages}
            currentThreadId={currentThreadId}
            onNewThread={handleNewChat}
            onSelectThread={handleSelectThread}
            onDeleteThread={handleDeleteThread}
            getThreadPreview={getThreadPreview}
          />
        </Popover>
      </div>

      {error && (
        <div
          className="error-message"
          style={{
            position: "fixed",
            top: "60px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            backgroundColor: "var(--palette-error-dark)",
            color: "#fff",
            padding: "8px 16px",
            borderRadius: "4px",
            maxWidth: "90%",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
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
        sendMessage={handleSendMessage}
        progressMessage={statusMessage}
        model={selectedModel}
        selectedCollections={[]}
        onModelChange={setSelectedModel}
        onStop={stopGeneration}
        onNewChat={handleNewChat}
        noMessagesPlaceholder={<WorkflowChatWelcome />}
        allowedProviders={[
          "OpenAI",
          "MiniMax",
          "Anthropic",
          "Google",
          "Gemini"
        ]}
        runningToolCallId={currentRunningToolCallId}
        runningToolMessage={currentToolMessage}
        workflowId={currentWorkflowId ?? null}
      />
    </div>
  );
};

export default memo(WorkflowAssistantChat);

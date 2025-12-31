/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useContext, useEffect, useState } from "react";
import { useTheme } from "@mui/material/styles";
import ChatView from "../chat/containers/ChatView";
import { DEFAULT_MODEL } from "../../config/constants";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { LanguageModel, Message, Workflow, NodeMetadata } from "../../stores/ApiTypes";
import { NewChatButton } from "../chat/thread/NewChatButton";
import { IconButton, Tooltip, Switch, FormControlLabel, Box, Button, Popover } from "@mui/material";
import ListIcon from "@mui/icons-material/List";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import AddIcon from "@mui/icons-material/Add";
import ThreadList from "../chat/thread/ThreadList";
import type { ThreadInfo } from "../chat/thread";
import { useNodes, NodeContext } from "../../contexts/NodeContext";
import { useLanguageModelsByProvider } from "../../hooks/useModelsByProvider";
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
    currentToolMessage
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
      fetchWorkflow: async (id: string) => {
        await fetchWorkflow(id);
      },
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

  // Popover state for thread list
  const [threadListAnchorEl, setThreadListAnchorEl] = useState<HTMLButtonElement | null>(null);
  const isThreadListOpen = Boolean(threadListAnchorEl);

  // Chat mode toggle state (help mode vs workflow chat mode)
  const [isHelpMode, setIsHelpMode] = useState(true);

  // Check if workflow has message input nodes
  const hasMessageInput = (() => {
    if (!nodes || nodes.length === 0) {return false;}
    return nodes.some((node: any) => {
      const nodeType = node.data?.type || node.type;
      const nodeName = node.data?.name || node.name;
      return (
        (nodeName === "message" || nodeName === "messages") &&
        (nodeType === "MessageInput" || nodeType === "MessageListInput")
      );
    });
  })();

  const { models: approvedModels } = useLanguageModelsByProvider({
    allowedProviders: ["OpenAI", "MiniMax", "Anthropic"]
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
  }, [approvedModels, selectedModel.id, selectedModel.provider]);

  // Handlers for thread actions
  const handleNewChat = useCallback(() => {
    createNewThread()
      .then((newThreadId) => {
        switchThread(newThreadId);
        setThreadListAnchorEl(null);
      })
      .catch((error) => {
        console.error("Failed to create new thread:", error);
      });
  }, [createNewThread, switchThread]);

  const handleSelectThread = useCallback(
    (id: string) => {
      switchThread(id);
      setThreadListAnchorEl(null);
    },
    [switchThread]
  );

  const handleOpenThreadList = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setThreadListAnchorEl(event.currentTarget);
  }, []);

  const handleCloseThreadList = useCallback(() => {
    setThreadListAnchorEl(null);
  }, []);

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
      if (!threads) {return "Loading...";}
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
      console.log("[WorkflowAssistantChat] Original message:", JSON.stringify(message, null, 2));
      const enrichedMessage = {
        ...message,
        workflow_id: currentWorkflowId ?? undefined,
        workflow_target: "workflow"
      };
      console.log("[WorkflowAssistantChat] Enriched message:", JSON.stringify(enrichedMessage, null, 2));
      await sendMessage(enrichedMessage);
    },
    [sendMessage, currentWorkflowId]
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

    // Get metadata for MessageInput node
    const metadata = nodeMetadata["nodetool.input.MessageInput"];
    if (!metadata) {
      console.error("MessageInput node metadata not found");
      return;
    }

    // Get the actual store state
    const store = currentNodeStore.getState();

    // Create MessageInput node with name "message" at a random position
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
    if (status === "stopping") {return "loading";}
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
        iconName={isHelpMode ? "assistant" : "chat"}
        svgProp={{
          width: 44,
          height: 44,
          opacity: 0.8,
          color: "var(--palette-primary-main)"
        }}
      />
      <h2 style={{ fontFamily: "var(--fontFamily2)", color: "var(--c_hl2)" }}>
        {isHelpMode ? "OPERATOR" : "WORKFLOW CHAT"}
      </h2>
      <p>
        {isHelpMode
          ? "Ask questions about your workflow or describe what you want to do."
          : "Chat with your workflow. Make sure run_mode is set to 'chat' in workflow settings."}
      </p>
      <p
        style={{
          fontSize: "0.85em",
          color: "var(--palette-grey-400)",
          marginTop: "1em",
          maxWidth: "280px"
        }}
      >
        {isHelpMode
          ? "This assistant uses OpenAI models for optimal workflow assistance."
          : "Messages will be sent to your workflow's MessageInput/MessageListInput nodes."}
      </p>
      {!hasMessageInput && !isHelpMode && (
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
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: "0.5em",
          padding: "4px 8px"
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            marginRight: "auto",
            flexWrap: "wrap"
          }}
        >
          <FormControlLabel
            control={
              <Switch
                checked={isHelpMode}
                onChange={(e) => setIsHelpMode(e.target.checked)}
                size="small"
                color="primary"
              />
            }
            label={isHelpMode ? "Help Mode" : "Workflow Chat"}
            sx={{
              fontSize: "0.85em",
              "& .MuiFormControlLabel-label": {
                fontSize: "0.85em"
              }
            }}
          />
          <Tooltip
            title={
              <div style={{ fontSize: "0.9em", lineHeight: 1.5, maxWidth: "350px" }}>
                <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
                  {isHelpMode ? "Help Mode" : "Workflow Chat Mode"}
                </div>
                {isHelpMode ? (
                  <>
                    <div>• Ask questions about your workflow</div>
                    <div>• Get assistance with building and editing</div>
                    <div>• The AI can modify your workflow using tools</div>
                  </>
                ) : (
                  <>
                    <div>• Run the current workflow as a chat bot</div>
                    <div style={{ marginTop: "8px", fontWeight: "bold" }}>
                      To use Workflow Chat:
                    </div>
                    <div>1. Set workflow <strong>run_mode</strong> to "chat" in settings</div>
                    <div>2. Add a <strong>MessageInput</strong> or <strong>MessageListInput</strong> node</div>
                    <div>3. The node will receive:</div>
                    <div style={{ marginLeft: "16px" }}>
                      • <code>message</code>: Current message object
                    </div>
                    <div style={{ marginLeft: "16px" }}>
                      • <code>messages</code>: Full chat history
                    </div>
                    <div style={{ marginTop: "8px", fontWeight: "bold" }}>
                      Output:
                    </div>
                    <div>Workflow outputs will be sent as chat responses</div>
                  </>
                )}
              </div>
            }
            placement="bottom-start"
            arrow
          >
            <HelpOutlineIcon
              sx={{
                fontSize: "1.1em",
                cursor: "help",
                color: "var(--palette-primary-main)"
              }}
            />
          </Tooltip>
        </Box>
        <NewChatButton onNewThread={handleNewChat} />
        <Tooltip title="Chat History">
          <IconButton onClick={handleOpenThreadList} size="small">
            <ListIcon />
          </IconButton>
        </Tooltip>
        {/* Thread List Popover */}
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
        sendMessage={handleSendMessage}
        progressMessage={statusMessage}
        model={selectedModel}
        selectedTools={[]}
        selectedCollections={[]}
        onModelChange={setSelectedModel}
        helpMode={isHelpMode}
        workflowAssistant={true}
        onStop={stopGeneration}
        onNewChat={handleNewChat}
        noMessagesPlaceholder={<AssistantWelcome />}
        allowedProviders={["OpenAI", "MiniMax", "Anthropic"]}
        runningToolCallId={currentRunningToolCallId}
        runningToolMessage={currentToolMessage}
        graph={isHelpMode ? {
          nodes: nodes.map(reactFlowNodeToGraphNode),
          edges: edges.map(reactFlowEdgeToGraphEdge)
        } : undefined}
      />
    </div>
  );
};

export default WorkflowAssistantChat;

/** @jsxImportSource @emotion/react */
import { memo, useCallback, useEffect, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";

import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

import { FlexColumn, Text, SPACING, getSpacingPx } from "../ui_primitives";
import ChatView from "../chat/containers/ChatView";
import ChatPanelHeader from "../chat/containers/ChatPanelHeader";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { useSketchSessionStore } from "../../stores/sketch/SketchSessionStore";

const styles = (_theme: Theme) =>
  css({
    "&": {
      height: "100%",
      minHeight: 0,
      display: "flex",
      flexDirection: "column"
    },
    // ChatView is tuned for the full-page global chat (large left/bottom
    // padding, centered max-width). Tighten it for this narrow side panel.
    "& .chat-view": {
      padding: `0 ${getSpacingPx(SPACING.xs)} ${getSpacingPx(
        SPACING.xs
      )} ${getSpacingPx(SPACING.xs)}`
    },
    "& .chat-input-section": {
      width: "100%",
      maxWidth: "100%"
    },
    "& .chat-thread-container": {
      maxWidth: "100%",
      paddingBottom: getSpacingPx(SPACING.md)
    }
  });

/**
 * Chat surface for the image / sketch editor. Reuses {@link ChatView} wired to
 * the shared {@link useGlobalChatStore}, so the assistant can call the
 * `ui_sketch_*` frontend tools the editor registers on the sketch agent
 * bridge — adding layers, generating imagery, and reshaping the canvas like a
 * real editor.
 */
const SketchAgentPanel = () => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  // Bind the open document as the chat's `workflow_id`. The server only
  // forwards client `ui_*` tools to the model when a turn carries a
  // workflow_id (unified-websocket-runner gates on it), so without this the
  // assistant never sees the editor's ui_sketch_* tools. The id is editor
  // context, not a routing signal — we don't set `workflow_target`, so the turn
  // stays a normal chat turn and the document is never run as a workflow.
  const documentId = useSketchSessionStore((s) => s.documentId);

  const { status, statusMessage, progress } = useGlobalChatStore(
    useShallow((state) => ({
      status: state.status,
      statusMessage: state.statusMessage,
      progress: state.progress
    }))
  );

  const { selectedModel, setSelectedModel } = useGlobalChatStore(
    useShallow((state) => ({
      selectedModel: state.selectedModel,
      setSelectedModel: state.setSelectedModel
    }))
  );

  const { sendMessage, stopGeneration, connect, createNewThread, switchThread } =
    useGlobalChatStore(
      useShallow((state) => ({
        sendMessage: state.sendMessage,
        stopGeneration: state.stopGeneration,
        connect: state.connect,
        createNewThread: state.createNewThread,
        switchThread: state.switchThread
      }))
    );

  // Subscribe to the cache + current thread so the panel re-renders as the
  // active conversation streams in; the messages themselves are read synchronously.
  const { currentThreadId, messageCache, getCurrentMessagesSync } =
    useGlobalChatStore(
      useShallow((state) => ({
        currentThreadId: state.currentThreadId,
        messageCache: state.messageCache,
        getCurrentMessagesSync: state.getCurrentMessagesSync
      }))
    );
  const messages = useMemo(
    () => getCurrentMessagesSync(),
    [getCurrentMessagesSync, currentThreadId, messageCache]
  );

  // Establish the chat connection (and send the frontend-tool manifest, which
  // now includes the editor's ui_sketch_* tools) when the panel mounts.
  useEffect(() => {
    connect().catch((err) => {
      console.error("Failed to connect image editor chat:", err);
    });
  }, [connect]);

  const chatStatus = useMemo(
    () => (status === "stopping" ? "loading" : status),
    [status]
  );

  const handleNewChat = useCallback(async () => {
    try {
      const id = await createNewThread();
      switchThread(id);
    } catch (err) {
      console.error("Failed to start new image editor chat:", err);
    }
  }, [createNewThread, switchThread]);

  const welcomePlaceholder = useMemo(
    () => (
      <FlexColumn
        align="center"
        justify="center"
        fullHeight
        padding={3}
        sx={{ textAlign: "center" }}
      >
        <AutoAwesomeIcon sx={{ fontSize: 40, mb: 1.5, opacity: 0.5 }} />
        <Text size="normal" weight={600} sx={{ mb: 1 }}>
          Editor Assistant
        </Text>
        <Text size="small" color="secondary" sx={{ maxWidth: 280 }}>
          Ask me to edit the image — e.g. &quot;generate a mountain landscape on
          a new layer&quot;, &quot;add a blank layer filled with black&quot;, or
          &quot;set the background layer to 50% opacity&quot;.
        </Text>
      </FlexColumn>
    ),
    []
  );

  return (
    <div css={cssStyles}>
      <ChatPanelHeader onNewChat={handleNewChat} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <ChatView
          status={chatStatus}
          messages={messages}
          workflowId={documentId}
          sendMessage={sendMessage}
          progress={progress.current}
          total={progress.total}
          progressMessage={statusMessage}
          model={selectedModel}
          onModelChange={setSelectedModel}
          onStop={stopGeneration}
          onNewChat={handleNewChat}
          requireToolSupport
          hideModePicker
          noMessagesPlaceholder={welcomePlaceholder}
        />
      </div>
    </div>
  );
};

export default memo(SketchAgentPanel);

/** @jsxImportSource @emotion/react */
import { memo, useCallback, useEffect, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";

import ViewInArIcon from "@mui/icons-material/ViewInAr";

import { FlexColumn, Text, SPACING, getSpacingPx } from "../ui_primitives";
import ChatView from "../chat/containers/ChatView";
import useGlobalChatStore from "../../stores/GlobalChatStore";

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
 * Chat surface for the 3D model editor. Reuses {@link ChatView} wired to the
 * shared {@link useGlobalChatStore}, so the assistant can call the `ui_3d_*`
 * frontend tools the editor registers on the tool bridge.
 */
const Model3DChatPanel = () => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

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
  // now includes the editor's ui_3d_* tools) when the editor mounts.
  useEffect(() => {
    connect().catch((err) => {
      console.error("Failed to connect 3D editor chat:", err);
    });
  }, [connect]);

  const chatStatus = useMemo(
    () => (status === "stopping" ? "connected" : status),
    [status]
  );

  const handleNewChat = useCallback(async () => {
    try {
      const id = await createNewThread();
      switchThread(id);
    } catch (err) {
      console.error("Failed to start new 3D editor chat:", err);
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
        <ViewInArIcon sx={{ fontSize: 40, mb: 1.5, opacity: 0.5 }} />
        <Text size="normal" weight={600} sx={{ mb: 1 }}>
          3D Assistant
        </Text>
        <Text size="small" color="secondary" sx={{ maxWidth: 280 }}>
          Ask me to build and edit the scene — e.g. &quot;add a red box and a
          sphere above it&quot;, &quot;make the floor blue&quot;, or &quot;list
          everything in the scene&quot;.
        </Text>
      </FlexColumn>
    ),
    []
  );

  return (
    <div css={cssStyles}>
      <ChatView
        status={chatStatus}
        messages={messages}
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
  );
};

export default memo(Model3DChatPanel);

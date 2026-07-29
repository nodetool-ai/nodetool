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

interface ScriptAgentPanelProps {
  scriptId: string;
}

/**
 * Chat surface for the Script editor. Reuses {@link ChatView} wired to the
 * shared {@link useGlobalChatStore}, so the assistant can call the
 * `ui_script_*` frontend tools the surface registers on the script agent
 * bridge — writing, casting, and voicing lines like a co-writer.
 */
const ScriptAgentPanel = ({ scriptId }: ScriptAgentPanelProps) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  // Bind the open script id as the chat's `workflow_id`. The server only
  // forwards client `ui_*` tools to the model when a turn carries a
  // workflow_id, so without this the assistant never sees the ui_script_*
  // tools. The id is editor context, not a routing signal — we don't set
  // `workflow_target`, so the turn stays a normal chat turn and the script is
  // never run as a workflow.
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

  const {
    sendMessage,
    stopGeneration,
    connect,
    createNewThread,
    switchThread
  } = useGlobalChatStore(
    useShallow((state) => ({
      sendMessage: state.sendMessage,
      stopGeneration: state.stopGeneration,
      connect: state.connect,
      createNewThread: state.createNewThread,
      switchThread: state.switchThread
    }))
  );

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
  // now includes the surface's ui_script_* tools) when the panel mounts.
  useEffect(() => {
    connect().catch((err) => {
      console.error("Failed to connect script editor chat:", err);
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
      console.error("Failed to start new script editor chat:", err);
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
          Script Assistant
        </Text>
        <Text size="small" color="secondary" sx={{ maxWidth: 280 }}>
          Ask me to write and voice the script — e.g. &quot;draft a 30-second
          intro for two hosts&quot;, &quot;add a line for Narrator&quot;, or
          &quot;voice every line and send it to a timeline&quot;.
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
          workflowId={scriptId}
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

export default memo(ScriptAgentPanel);

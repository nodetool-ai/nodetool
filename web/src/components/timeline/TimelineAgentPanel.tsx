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
import { useChatViewThread } from "../../hooks/chat/useChatViewThread";
import { useInStudio } from "../../studio/StudioContext";
import { useTimelineStore } from "../../stores/timeline/TimelineStore";

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
 * Chat surface for the timeline / video editor. Reuses {@link ChatView} wired
 * to the shared {@link useGlobalChatStore}, so the assistant can call the
 * `ui_timeline_*` frontend tools the editor registers on the timeline agent
 * bridge — cutting, generating, and tweaking clips like a real editor.
 */
const TimelineAgentPanel = () => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const inStudio = useInStudio();

  // Bind the open sequence as the chat's `workflow_id`. The server only
  // forwards client `ui_*` tools to the model when a turn carries a
  // workflow_id (unified-websocket-runner gates on it), so without this the
  // assistant never sees the editor's ui_timeline_* tools. The id is editor
  // context, not a routing signal — we don't set `workflow_target`, so the
  // turn stays a normal chat turn and the sequence is never run as a workflow.
  const sequenceId = useTimelineStore((s) => s.sequenceId);

  const { selectedModel, setSelectedModel } = useGlobalChatStore(
    useShallow((state) => ({
      selectedModel: state.selectedModel,
      setSelectedModel: state.setSelectedModel
    }))
  );

  const { connect, createNewThread } = useGlobalChatStore(
    useShallow((state) => ({
      connect: state.connect,
      createNewThread: state.createNewThread
    }))
  );
  const {
    threadId,
    messages,
    runtime,
    selectThread,
    sendMessage,
    stopGeneration
  } = useChatViewThread();

  // Establish the chat connection (and send the frontend-tool manifest, which
  // now includes the editor's ui_timeline_* tools) when the panel mounts.
  useEffect(() => {
    connect().catch((err) => {
      console.error("Failed to connect timeline editor chat:", err);
    });
  }, [connect]);

  const chatStatus =
    runtime.status === "idle" || runtime.status === "stopping"
      ? "connected"
      : runtime.status;

  const handleNewChat = useCallback(async () => {
    try {
      const id = await createNewThread();
      selectThread(id);
    } catch (err) {
      console.error("Failed to start new timeline editor chat:", err);
    }
  }, [createNewThread, selectThread]);

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
          Ask me to edit the timeline — e.g. &quot;generate a 5-second clip of a
          city at night&quot;, &quot;split the selected clip at the
          playhead&quot;, or &quot;fade out the last clip&quot;.
        </Text>
      </FlexColumn>
    ),
    []
  );

  return (
    <div css={cssStyles}>
      <ChatPanelHeader
        onNewChat={handleNewChat}
        onSelectThread={selectThread}
        threadId={threadId}
        docsTopic="timelines"
        docsLabel="Video editor"
      />
      <div style={{ flex: 1, minHeight: 0 }}>
        <ChatView
          status={chatStatus}
          messages={messages}
          workflowId={sequenceId}
          sendMessage={sendMessage}
          progress={runtime.progress.current}
          total={runtime.progress.total}
          progressMessage={runtime.statusMessage}
          model={selectedModel}
          onModelChange={setSelectedModel}
          hideModelPicker={inStudio}
          onStop={stopGeneration}
          onNewChat={handleNewChat}
          requireToolSupport
          hideModePicker
          noMessagesPlaceholder={welcomePlaceholder}
          threadId={threadId}
          currentPlanningUpdate={runtime.planningUpdate}
          currentTaskUpdate={runtime.taskUpdate}
          currentLogUpdate={runtime.logUpdate}
          runningToolCallId={runtime.runningToolCallId}
          runningToolMessage={runtime.toolMessage}
        />
      </div>
    </div>
  );
};

export default memo(TimelineAgentPanel);

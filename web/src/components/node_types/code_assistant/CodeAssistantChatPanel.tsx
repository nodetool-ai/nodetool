/** @jsxImportSource @emotion/react */
import { memo, useCallback, useEffect, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";

import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

import { FlexColumn, Text, SPACING, getSpacingPx } from "../../ui_primitives";
import ChatView from "../../chat/containers/ChatView";
import ChatPanelHeader from "../../chat/containers/ChatPanelHeader";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { useChatViewThread } from "../../../hooks/chat/useChatViewThread";

const styles = (_theme: Theme) =>
  css({
    "&": {
      height: "100%",
      minHeight: 0,
      display: "flex",
      flexDirection: "column"
    },
    // ChatView is tuned for the full-page global chat. Tighten it for this
    // narrow side panel.
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

/** Teaches the agent the Code assistant surface and the sandbox contract. */
const codeAssistantSystemPrompt = (nodeId: string): string =>
  `# Code assistant
The user is editing the body of a \`nodetool.code.Code\` node (node id
"${nodeId}") in the Code assistant. You edit a draft — nothing touches the
node until the user clicks Apply.

- Read the draft with \`ui_code_get_state\` (code, inputs, outputs, packages).
- Edit with \`ui_code_set_code\` (replace the code body),
  \`ui_code_set_ports\` (declare input/output handles), and
  \`ui_code_set_packages\` (declare sandbox packages).
- Check your work with the server tools: \`validate_code\` after every edit,
  \`run_code\` to debug with sample inputs, \`test_code\` for regression cases.

Code contract: declared inputs arrive on the \`inputs\` object
(\`inputs.<name>\`); the returned object's keys become the node's output
handles, so every declared output must be set on every return path; \`yield\`
streams items; a sandbox package must be declared (ui_code_set_packages)
before its import resolves.`;

export interface CodeAssistantChatPanelProps {
  /** The Code node whose draft the ui_code_* tools edit. */
  nodeId: string;
  /** The workflow the chat turn is bound to (required for ui_* tools). */
  workflowId: string;
}

/**
 * Chat surface for the Code assistant dialog. Reuses {@link ChatView} wired to
 * the shared {@link useGlobalChatStore}, so the assistant can call the
 * `ui_code_*` frontend tools the dialog registers on the code assistant
 * bridge, plus the server-side `validate_code` / `run_code` / `test_code`
 * checkers.
 */
const CodeAssistantChatPanel = ({
  nodeId,
  workflowId
}: CodeAssistantChatPanelProps) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

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
  // includes the ui_code_* tools) when the panel mounts.
  useEffect(() => {
    connect().catch((err) => {
      console.error("Failed to connect Code assistant chat:", err);
    });
  }, [connect]);

  const chatStatus =
    runtime.status === "idle"
      ? "connected"
      : runtime.status === "stopping"
        ? "loading"
        : runtime.status;

  const handleNewChat = useCallback(async () => {
    try {
      const id = await createNewThread();
      selectThread(id);
    } catch (err) {
      console.error("Failed to start new Code assistant chat:", err);
    }
  }, [createNewThread, selectThread]);

  const systemPrompt = useMemo(
    () => codeAssistantSystemPrompt(nodeId),
    [nodeId]
  );

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
          Code Assistant
        </Text>
        <Text size="small" color="secondary" sx={{ maxWidth: 280 }}>
          Ask me to write or change this node&apos;s code — e.g. &quot;merge the
          two lists on id&quot;, &quot;add an error output&quot;, or &quot;test
          this with a sample list&quot;.
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
      />
      <div style={{ flex: 1, minHeight: 0 }}>
        <ChatView
          status={chatStatus}
          messages={messages}
          workflowId={workflowId}
          sendMessage={sendMessage}
          progress={runtime.progress.current}
          total={runtime.progress.total}
          progressMessage={runtime.statusMessage}
          model={selectedModel}
          onModelChange={setSelectedModel}
          onStop={stopGeneration}
          onNewChat={handleNewChat}
          systemPrompt={systemPrompt}
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

export default memo(CodeAssistantChatPanel);

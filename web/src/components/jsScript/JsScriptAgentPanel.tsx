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

/** Teaches the agent the JS script surface and the sandbox contract. */
const jsScriptSystemPrompt = (scriptId: string): string =>
  `# JS script assistant
The user is editing a JS script document (script id "${scriptId}"). Unlike the
Code node assistant, your edits ARE the document — they autosave, there is no
Apply.

- Read it with \`ui_jsscript_get_state\` (name, document, validation issues,
  last run and test results).
- Edit with \`ui_jsscript_set_code\`, \`ui_jsscript_set_ports\`,
  \`ui_jsscript_set_packages\`, \`ui_jsscript_set_meta\` (name, description,
  secrets, timeout), and \`ui_jsscript_set_tests\`.
- Check your work with \`ui_jsscript_run\` (given inputs) and
  \`ui_jsscript_test\` (the saved cases). Both execute server-side against the
  saved document.

Script contract: declared inputs arrive on the \`inputs\` object
(\`inputs.<name>\`); values leave through \`emit(name, value)\` /
\`output(name, value)\`, never through \`return\`; a sandbox package must be
declared before its import resolves; there is no toolbelt — a script is a
function over its inputs.`;

export interface JsScriptAgentPanelProps {
  scriptId: string;
}

/**
 * Chat surface for the JS script editor. Reuses {@link ChatView} wired to the
 * shared {@link useGlobalChatStore}, so the assistant can call the
 * `ui_jsscript_*` frontend tools the surface registers on the JS script agent
 * bridge.
 */
const JsScriptAgentPanel = ({ scriptId }: JsScriptAgentPanelProps) => {
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
  // includes the ui_jsscript_* tools) when the panel mounts.
  useEffect(() => {
    connect().catch((err) => {
      console.error("Failed to connect JS script editor chat:", err);
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
      console.error("Failed to start new JS script chat:", err);
    }
  }, [createNewThread, switchThread]);

  const systemPrompt = useMemo(
    () => jsScriptSystemPrompt(scriptId),
    [scriptId]
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
          JS Script Assistant
        </Text>
        <Text size="small" color="secondary" sx={{ maxWidth: 280 }}>
          Ask me to write or change this script — e.g. &quot;parse the CSV and
          emit one row per line&quot;, &quot;add an error output&quot;, or
          &quot;write a test for the empty case&quot;.
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
          systemPrompt={systemPrompt}
          requireToolSupport
          hideModePicker
          noMessagesPlaceholder={welcomePlaceholder}
        />
      </div>
    </div>
  );
};

export default memo(JsScriptAgentPanel);

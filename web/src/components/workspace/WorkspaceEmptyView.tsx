/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useCallback, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import useGlobalChatStore from "../../stores/GlobalChatStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import type { Message, MessageContent } from "../../stores/ApiTypes";
import ChatInputSection from "../chat/containers/ChatInputSection";
import { Caption, SPACING, getSpacingPx } from "../ui_primitives";

const styles = (theme: Theme) =>
  css({
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: getSpacingPx(SPACING.lg),
    padding: theme.spacing(0, 3),
    textAlign: "center",
    color: theme.vars.palette.text.secondary,

    ".empty-composer": {
      width: "100%",
      maxWidth: 720,
      display: "flex",
      justifyContent: "center"
    }
  });

/**
 * Shown in the workspace when no tabs are open. Carries the chat composer that
 * used to live on the dashboard hero: a message sent here creates a thread,
 * opens it as a chat tab, and delivers the message to that tab.
 */
const WorkspaceEmptyView = () => {
  const theme = useTheme();
  const emptyStyles = useMemo(() => styles(theme), [theme]);

  const openTab = useWorkspaceTabsStore((state) => state.openTab);

  const { status, selectedModel, setSelectedModel, stopGeneration } =
    useGlobalChatStore(
      useShallow((state) => ({
        status: state.status,
        selectedModel: state.selectedModel,
        setSelectedModel: state.setSelectedModel,
        stopGeneration: state.stopGeneration
      }))
    );
  const connect = useGlobalChatStore((state) => state.connect);

  useEffect(() => {
    connect().catch((error) => {
      console.error("Failed to connect chat:", error);
    });
  }, [connect]);

  const handleSend = useCallback(
    async (content: MessageContent[]) => {
      const store = useGlobalChatStore.getState();
      try {
        const threadId = await store.createNewThread();
        openTab({
          type: "chat",
          ref: threadId,
          mode: "view",
          title: "New chat"
        });
        const message: Message = {
          type: "message",
          role: "user",
          content,
          thread_id: threadId,
          created_at: new Date().toISOString(),
          model: store.selectedModel?.id
        };
        await store.sendMessage(message, threadId);
      } catch (error) {
        console.error("Failed to start chat:", error);
      }
    },
    [openTab]
  );

  // ChatInputSection has no "stopping" state; the composer treats it as idle.
  const inputStatus = status === "stopping" ? "connected" : status;

  return (
    <div css={emptyStyles} className="workspace-empty">
      <Caption color="secondary">
        No tabs open — ask below to start a chat, or use + to open a document.
      </Caption>
      <div className="empty-composer">
        <ChatInputSection
          status={inputStatus}
          onSendMessage={handleSend}
          onStop={stopGeneration}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
        />
      </div>
    </div>
  );
};

export default memo(WorkspaceEmptyView);

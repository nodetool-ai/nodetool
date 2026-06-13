/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import AddCommentOutlinedIcon from "@mui/icons-material/AddCommentOutlined";

import { Text, Tooltip, FlexRow, MOTION } from "../ui_primitives";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import ChatThreadView from "../chat/thread/ChatThreadView";
import type { Message } from "../../stores/ApiTypes";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

type ThreadStatus = React.ComponentProps<typeof ChatThreadView>["status"];

const EMPTY_MESSAGES: Message[] = [];

const styles = (theme: Theme) =>
  css({
    width: "100%",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    maxHeight: "min(46vh, 460px)",
    borderRadius: "16px",
    overflow: "hidden",
    background:
      theme.palette.mode === "light"
        ? theme.vars.palette.background.paper
        : theme.vars.palette.grey[900],
    backdropFilter: "blur(16px)",
    border: `1px solid ${
      theme.palette.mode === "light"
        ? theme.vars.palette.grey[600]
        : theme.vars.palette.divider
    }`,
    boxShadow:
      theme.palette.mode === "light"
        ? "0 1px 2px rgba(26,23,21,0.04), 0 8px 24px rgba(26,23,21,0.08)"
        : "0 10px 40px rgba(0,0,0,0.45)",

    ".convo-overlay-header": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      padding: `${theme.spacing(0.75)} ${theme.spacing(1.5)}`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      flexShrink: 0
    },

    ".convo-overlay-body": {
      flex: 1,
      minHeight: 0,
      position: "relative",
      display: "flex",
      flexDirection: "column"
    },

    ".convo-icon-btn": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "26px",
      height: "26px",
      border: "none",
      borderRadius: "999px",
      background: "transparent",
      color: theme.vars.palette.grey[400],
      cursor: "pointer",
      transition: `${MOTION.background}, color ${MOTION.fast}`,
      "& svg": { fontSize: "18px" },
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800],
        color: theme.vars.palette.grey[100]
      }
    }
  });

interface ConversationOverlayProps {
  /** Collapse the overlay (the composer keeps a toggle to reopen it). */
  onCollapse: () => void;
}

/**
 * Floating, auto-updating view of the active chat thread, shown above the
 * canvas composer. Reuses {@link ChatThreadView} so messages, media output and
 * streaming indicators render exactly as in the chat panel.
 */
const ConversationOverlay: React.FC<ConversationOverlayProps> = ({
  onCollapse
}) => {
  const theme = useTheme();

  const messages = useGlobalChatStore((state) =>
    state.currentThreadId
      ? state.messageCache[state.currentThreadId] ?? EMPTY_MESSAGES
      : EMPTY_MESSAGES
  );
  const rawStatus = useGlobalChatStore((state) => state.status);
  const { current, total } = useGlobalChatStore(
    useShallow((state) => state.progress)
  );
  const statusMessage = useGlobalChatStore((state) => state.statusMessage);
  const runningToolCallId = useGlobalChatStore(
    (state) => state.currentRunningToolCallId
  );
  const runningToolMessage = useGlobalChatStore(
    (state) => state.currentToolMessage
  );
  const currentPlanningUpdate = useGlobalChatStore(
    (state) => state.currentPlanningUpdate
  );
  const currentTaskUpdate = useGlobalChatStore(
    (state) => state.currentTaskUpdate
  );
  const currentLogUpdate = useGlobalChatStore((state) => state.currentLogUpdate);
  const title = useGlobalChatStore((state) =>
    state.currentThreadId
      ? state.threads[state.currentThreadId]?.title ?? null
      : null
  );
  const createNewThread = useGlobalChatStore((state) => state.createNewThread);

  // ChatThreadView's status union excludes "stopping" — map it like GlobalChat.
  const status: ThreadStatus =
    rawStatus === "stopping" ? "loading" : (rawStatus as ThreadStatus);

  return (
    <div css={styles(theme)} className="conversation-overlay">
      <div className="convo-overlay-header">
        <Text
          size="small"
          sx={{
            color: theme.vars.palette.grey[300],
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {title || "Conversation"}
        </Text>
        <FlexRow gap={0.5} align="center" sx={{ ml: "auto" }}>
          <Tooltip title="New conversation" delay={TOOLTIP_ENTER_DELAY}>
            <button
              type="button"
              className="convo-icon-btn"
              onClick={() => void createNewThread()}
              aria-label="New conversation"
            >
              <AddCommentOutlinedIcon />
            </button>
          </Tooltip>
          <Tooltip title="Hide conversation" delay={TOOLTIP_ENTER_DELAY}>
            <button
              type="button"
              className="convo-icon-btn"
              onClick={onCollapse}
              aria-label="Hide conversation"
            >
              <KeyboardArrowDownIcon />
            </button>
          </Tooltip>
        </FlexRow>
      </div>
      <div className="convo-overlay-body">
        <ChatThreadView
          messages={messages}
          status={status}
          progress={current}
          total={total}
          progressMessage={statusMessage}
          runningToolCallId={runningToolCallId}
          runningToolMessage={runningToolMessage}
          currentPlanningUpdate={currentPlanningUpdate}
          currentTaskUpdate={currentTaskUpdate}
          currentLogUpdate={currentLogUpdate}
        />
      </div>
    </div>
  );
};

export default memo(ConversationOverlay);

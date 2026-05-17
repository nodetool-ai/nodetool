/** @jsxImportSource @emotion/react */
/**
 * ChatMessagesBody — bespoke body for `nodetool.input.ChatMessages`.
 *
 * Renders the current chat thread's message list (ChatView-style) inside the
 * node body so the conversation lives on the canvas next to the composer.
 */

import React, { memo, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";

import { FlexColumn } from "../../ui_primitives";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";
import ChatThreadView from "../../chat/thread/ChatThreadView";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import useGlobalChatStore from "../../../stores/GlobalChatStore";

export const CHAT_MESSAGES_NODE_TYPE = "nodetool.input.ChatMessages";

const styles = (theme: Theme) =>
  css({
    "&.chat-messages-body": {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5),
      padding: theme.spacing(0.5),
      minHeight: 0
    },
    ".messages-shell": {
      flex: "1 1 auto",
      minHeight: 200,
      display: "flex",
      flexDirection: "column",
      borderRadius: "var(--rounded-sm)",
      backgroundColor: "rgba(255, 255, 255, 0.02)",
      border: `1px solid ${theme.vars.palette.divider}`,
      overflow: "hidden",
      // ChatThreadView fills its container.
      "& > div": {
        flex: 1,
        minHeight: 0
      }
    },
    ".empty-placeholder": {
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing(2),
      textAlign: "center",
      color: theme.vars.palette.text.secondary,
      fontSize: theme.fontSizeSmall,
      fontFamily: theme.fontFamily1
    },
    ".outputs-row": {
      flex: "0 0 auto"
    }
  });

export interface ChatMessagesBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const ChatMessagesBodyInner: React.FC<ChatMessagesBodyProps> = ({
  id,
  nodeMetadata,
  workflowId,
  status,
  isOutputNode
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const {
    currentThreadId,
    messageCache,
    chatStatus,
    progress,
    statusMessage,
    currentRunningToolCallId,
    currentToolMessage
  } = useGlobalChatStore(
    useShallow((state) => ({
      currentThreadId: state.currentThreadId,
      messageCache: state.messageCache,
      chatStatus: state.status,
      progress: state.progress,
      statusMessage: state.statusMessage,
      currentRunningToolCallId: state.currentRunningToolCallId,
      currentToolMessage: state.currentToolMessage
    }))
  );

  const messages = useMemo(() => {
    if (!currentThreadId) return [];
    return messageCache[currentThreadId] ?? [];
  }, [currentThreadId, messageCache]);

  // Map "stopping" → "loading" for ChatThreadView, which doesn't model it.
  const threadStatus = chatStatus === "stopping" ? "loading" : chatStatus;

  return (
    <div
      css={cssStyles}
      className="chat-messages-body"
      data-bespoke-body="ChatMessages"
    >
      <FlexColumn className="messages-shell" gap={0}>
        {messages.length > 0 ? (
          <ChatThreadView
            messages={messages}
            status={threadStatus}
            progress={progress.current}
            total={progress.total}
            progressMessage={statusMessage}
            runningToolCallId={currentRunningToolCallId}
            runningToolMessage={currentToolMessage}
          />
        ) : (
          <div className="empty-placeholder">
            Send a message from a Chat Composer to start the conversation.
          </div>
        )}
      </FlexColumn>

      {!isOutputNode && (
        <div className="outputs-row">
          <NodeOutputs id={id} outputs={nodeMetadata.outputs} />
        </div>
      )}

      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </div>
  );
};

export const ChatMessagesBody = memo(ChatMessagesBodyInner);
ChatMessagesBody.displayName = "ChatMessagesBody";

export default ChatMessagesBody;

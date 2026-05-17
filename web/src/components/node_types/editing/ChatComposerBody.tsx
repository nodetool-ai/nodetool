/** @jsxImportSource @emotion/react */
/**
 * ChatComposerBody — bespoke body for `nodetool.input.ChatComposer`.
 *
 * Renders a textarea + send button on the canvas. Sending dispatches the
 * message through GlobalChatStore with workflow routing so the workflow's
 * downstream pipeline receives the typed message on this node's output.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";
import SendIcon from "@mui/icons-material/Send";
import StopIcon from "@mui/icons-material/Stop";

import { FlexColumn, FlexRow, ToolbarIconButton } from "../../ui_primitives";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata, Message } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import useGlobalChatStore from "../../../stores/GlobalChatStore";

export const CHAT_COMPOSER_NODE_TYPE = "nodetool.input.ChatComposer";

const MAX_TEXTAREA_HEIGHT = 180;

const styles = (theme: Theme) =>
  css({
    "&.chat-composer-body": {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5),
      padding: theme.spacing(0.5),
      minHeight: 0
    },
    ".composer-shell": {
      flex: "1 1 auto",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5),
      padding: theme.spacing(0.75),
      borderRadius: "var(--rounded-sm)",
      backgroundColor: "rgba(255, 255, 255, 0.03)",
      border: `1px solid ${theme.vars.palette.divider}`,
      minHeight: 0,
      "&:focus-within": {
        borderColor: theme.vars.palette.primary.main,
        backgroundColor: "rgba(255, 255, 255, 0.05)"
      }
    },
    ".composer-textarea": {
      flex: "1 1 auto",
      minHeight: 44,
      maxHeight: MAX_TEXTAREA_HEIGHT,
      width: "100%",
      resize: "none",
      border: "none",
      outline: "none",
      background: "transparent",
      color: theme.vars.palette.text.primary,
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      lineHeight: "1.4",
      "&::placeholder": {
        color: theme.vars.palette.text.disabled
      }
    },
    ".composer-footer": {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: theme.spacing(0.5)
    },
    ".outputs-row": {
      flex: "0 0 auto"
    }
  });

export interface ChatComposerBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const ChatComposerBodyInner: React.FC<ChatComposerBodyProps> = ({
  id,
  nodeMetadata,
  data,
  workflowId,
  status,
  isOutputNode
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const { sendMessage, chatStatus, stopGeneration } = useGlobalChatStore(
    useShallow((state) => ({
      sendMessage: state.sendMessage,
      chatStatus: state.status,
      stopGeneration: state.stopGeneration
    }))
  );

  const nodeName = useMemo(() => {
    const raw = data.properties?.name;
    return typeof raw === "string" ? raw.trim() : "";
  }, [data.properties]);

  const [prompt, setPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize the textarea up to MAX_TEXTAREA_HEIGHT.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const next = Math.min(ta.scrollHeight, MAX_TEXTAREA_HEIGHT);
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
  }, [prompt]);

  const isStreaming = chatStatus === "streaming" || chatStatus === "loading";
  const isStopping = chatStatus === "stopping";
  const canSend = prompt.trim().length > 0 && !isStreaming && !isStopping;

  const handleSend = useCallback(async () => {
    const text = prompt.trim();
    if (!text) return;
    const message = {
      type: "message",
      role: "user",
      content: [{ type: "text", text }],
      workflow_id: workflowId,
      workflow_target: "workflow",
      ...(nodeName ? { workflow_message_input_name: nodeName } : {})
    } as Message & {
      workflow_message_input_name?: string;
    };
    setPrompt("");
    await sendMessage(message);
  }, [prompt, workflowId, nodeName, sendMessage]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (canSend) {
          void handleSend();
        }
      }
    },
    [canSend, handleSend]
  );

  return (
    <div
      css={cssStyles}
      className="chat-composer-body"
      data-bespoke-body="ChatComposer"
    >
      <FlexColumn className="composer-shell" gap={0.5}>
        <textarea
          ref={textareaRef}
          className="composer-textarea nodrag nowheel"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            nodeName
              ? `Send a message (Shift+Enter for newline)`
              : "Set a node name to enable chat routing"
          }
          rows={2}
          spellCheck={false}
          autoComplete="off"
        />
        <FlexRow className="composer-footer" gap={0.5} align="center">
          {isStreaming || isStopping ? (
            <ToolbarIconButton
              tooltip={isStopping ? "Stopping…" : "Stop generation"}
              onClick={stopGeneration}
              disabled={isStopping}
              icon={<StopIcon sx={{ fontSize: 18 }} />}
            />
          ) : (
            <ToolbarIconButton
              tooltip={canSend ? "Send message (Enter)" : "Type a message"}
              onClick={() => void handleSend()}
              disabled={!canSend}
              icon={<SendIcon sx={{ fontSize: 18 }} />}
            />
          )}
        </FlexRow>
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

export const ChatComposerBody = memo(ChatComposerBodyInner);
ChatComposerBody.displayName = "ChatComposerBody";

export default ChatComposerBody;

/** @jsxImportSource @emotion/react */
import React, { memo, useMemo, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Message, ToolCall } from "../../stores/ApiTypes";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import ImageView from "./ImageView";
import isEqual from "fast-deep-equal";
import { BORDER_RADIUS } from "../ui_primitives";

const styles = (theme: Theme) =>
  css({
    "&": {
      maxHeight: "500px",
      width: "100%",
      overflow: "auto"
    },
    ".messages li .tool-calls": {
      margin: "1em 0",
      display: "grid",
      gap: "0.75em"
    },
    ".messages li .tool-call": {
      fontFamily: theme.fontFamily2,
      background: `linear-gradient(135deg, rgba(${theme.vars.palette.primary.darkChannel} / 0.35) 0%, rgba(${theme.vars.palette.primary.mainChannel} / 0.12) 100%)`,
      border: `1px solid rgba(${theme.vars.palette.primary.mainChannel} / 0.35)`,
      borderRadius: BORDER_RADIUS.xl,
      padding: "0.9em 1.1em",
      boxShadow: "0 8px 16px rgba(0 0 0 / 0.18)",
      position: "relative",
      overflow: "hidden"
    },
    ".messages li .tool-call::before": {
      content: '""',
      position: "absolute",
      inset: "0",
      background: `linear-gradient(140deg, rgba(${theme.vars.palette.primary.mainChannel} / 0.2) 0%, transparent 60%)`,
      pointerEvents: "none"
    },
    ".messages li .tool-call__header": {
      display: "flex",
      alignItems: "center",
      gap: "0.6em",
      marginBottom: "0.65em"
    },
    ".messages li .tool-call__badge": {
      fontSize: theme.fontSizeSmaller,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      fontWeight: 600,
      color: theme.vars.palette.primary.main,
      backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.15)`,
      padding: "0.2em 0.55em",
      borderRadius: BORDER_RADIUS.pill
    },
    ".messages li .tool-call__name": {
      color: theme.vars.palette.grey[50],
      fontWeight: 600,
      fontSize: theme.fontSizeSmall,
      letterSpacing: "0.01em"
    },
    ".messages li .tool-call__message": {
      color: theme.vars.palette.grey[200],
      fontSize: theme.fontSizeSmall,
      lineHeight: 1.6,
      position: "relative",
      zIndex: 1
    },
    ".messages li .tool-call__message pre": {
      backgroundColor: theme.vars.palette.c_scrim_soft,
      borderRadius: BORDER_RADIUS.lg,
      padding: "0.75em",
      marginTop: "0.8em",
      overflowX: "auto"
    },
    ".messages li .tool-call__message code": {
      fontFamily: theme.fontFamily2
    },
    ".messages": {
      listStyleType: "none",
      padding: theme.spacing(4)
    },
    ".messages li.chat-message": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      listStyleType: "none"
    },
    ".messages li.chat-message p": {
      margin: "0.3em 0",
      lineHeight: "1.5em",
      fontWeight: 400
    },
    ".messages li.user": {
      color: theme.vars.palette.grey[200],
      borderBottom: `1px solid ${theme.vars.palette.grey[600]}`,
      padding: "0.1em 0.2em 0",
      margin: "2em 0 1em 0"
    },
    ".messages li.assistant": {
      color: theme.vars.palette.grey[0]
    },
    ".messages li pre": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      backgroundColor: theme.vars.palette.grey[1000],
      padding: "1em"
    },
    ".messages li pre code": {
      fontFamily: theme.fontFamily2,
      color: theme.vars.palette.grey[0]
    },
    ".messages li a": {
      color: "var(--palette-primary-main)"
    },
    ".messages li a:hover": {
      color: theme.vars.palette.grey[400]
    }
  });

type ChatViewProps = {
  messages: Array<Message>;
};

const formatToolName = (name?: string) => {
  if (!name) {return "Agent Task";}
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const ToolCallsView: React.FC<{ toolCalls?: ToolCall[] | null }> = memo(({
  toolCalls
}) => {
  if (!toolCalls || toolCalls.length === 0) {return null;}
  return (
    <div className="tool-calls">
      {toolCalls.map((tc, idx) => {
        const stableKey = tc.id || `tool-${tc.name}-${idx}`;
        return (
          <div key={stableKey} className="tool-call">
            <div className="tool-call__header">
              <span className="tool-call__badge">Agent Task</span>
              <span className="tool-call__name">{formatToolName(tc.name)}</span>
            </div>
            {tc.message && (
              <div className="tool-call__message">
                <MarkdownRenderer content={tc.message} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

const MessageView: React.FC<{ msg: Message }> = memo(({ msg }) => {
  let messageClass = "chat-message";

  if (msg.role === "user") {
    messageClass += " user";
  } else if (msg.role === "assistant") {
    messageClass += " assistant";
  } else if (msg.role === "tool") {
    messageClass += " tool";
  }
  return (
    <li className={messageClass}>
      {msg.role === "assistant" && msg.tool_calls && (
        <ToolCallsView toolCalls={msg.tool_calls as ToolCall[]} />
      )}
      {typeof msg.content === "string" && (
        <MarkdownRenderer content={msg.content} />
      )}
      {Array.isArray(msg.content) &&
        msg.content.map((c, i) => {
          if (c.type === "text") {
            return <MarkdownRenderer key={`text-${i}`} content={c.text || ""} />;
          } else if (c.type === "image_url") {
            return <ImageView key={c.image?.uri ?? `img-${i}`} source={c.image?.uri} />;
          } else {
            return null;
          }
        })}
    </li>
  );
});

const ThreadMessageList: React.FC<ChatViewProps> = ({ messages }) => {
  const theme = useTheme();
  const messagesListRef = useRef<HTMLUListElement | null>(null);
  const cssStyles = useMemo(() => styles(theme), [theme]);

  return (
    <div css={cssStyles}>
      <ul className="messages" ref={messagesListRef}>
        {messages.map((msg) => (
          <MessageView key={msg.id} msg={msg} />
        ))}
      </ul>
    </div>
  );
};

export default memo(ThreadMessageList, isEqual);

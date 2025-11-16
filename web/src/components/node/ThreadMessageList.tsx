/** @jsxImportSource @emotion/react */
import React, { memo, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme, alpha } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Message, ToolCall } from "../../stores/ApiTypes";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import { isEqual } from "lodash";

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
      background: `linear-gradient(135deg, ${alpha(
        theme.vars.palette.primary.dark,
        0.35
      )} 0%, ${alpha(theme.vars.palette.primary.main, 0.12)} 100%)`,
      border: `1px solid ${alpha(theme.vars.palette.primary.main, 0.35)}`,
      borderRadius: "14px",
      padding: "0.9em 1.1em",
      boxShadow: `0 8px 16px ${alpha(theme.vars.palette.common.black, 0.18)}`,
      position: "relative",
      overflow: "hidden"
    },
    ".messages li .tool-call::before": {
      content: '""',
      position: "absolute",
      inset: "0",
      background: `linear-gradient(140deg, ${alpha(
        theme.vars.palette.primary.main,
        0.2
      )} 0%, transparent 60%)`,
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
      fontWeight: 700,
      color: theme.vars.palette.primary.main,
      backgroundColor: alpha(theme.vars.palette.primary.main, 0.15),
      padding: "0.2em 0.55em",
      borderRadius: "999px"
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
      backgroundColor: alpha(theme.vars.palette.common.black, 0.35),
      borderRadius: "10px",
      padding: "0.75em",
      marginTop: "0.8em",
      overflowX: "auto"
    },
    ".messages li .tool-call__message code": {
      fontFamily: theme.fontFamily2
    },
    ".messages": {
      listStyleType: "none",
      padding: "14px"
    },
    ".messages li.chat-message": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      listStyleType: "none"
    },
    ".messages li.chat-message p": {
      margin: "0.3em 0",
      lineHeight: "1.5em",
      fontWeight: "400"
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
  if (!name) return "Agent Task";
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const ToolCallsView: React.FC<{ toolCalls?: ToolCall[] | null }> = ({
  toolCalls
}) => {
  if (!toolCalls || toolCalls.length === 0) return null;
  return (
    <div className="tool-calls">
      {toolCalls.map((tc, idx) => (
        <div key={tc.id || idx} className="tool-call">
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
      ))}
    </div>
  );
};

const MessageView = (msg: Message) => {
  let messageClass = "chat-message";

  if (msg.role === "user") {
    messageClass += " user";
  } else if (msg.role === "assistant") {
    messageClass += " assistant";
  } else if (msg.role === "tool") {
    messageClass += " tool";
  }
  return (
    <li className={messageClass} key={msg.id}>
      {msg.role === "assistant" && msg.tool_calls && (
        <ToolCallsView toolCalls={msg.tool_calls as ToolCall[]} />
      )}
      {typeof msg.content === "string" && (
        <MarkdownRenderer key={msg.id} content={msg.content} />
      )}
      {typeof msg.content === "object" &&
        msg.content?.map((c) => {
          if (c.type === "text") {
            return <MarkdownRenderer key={msg.id} content={c.text || ""} />;
          } else if (c.type === "image_url") {
            return <img key={c.image?.uri} src={c.image?.uri} alt="" />;
          } else {
            return <></>;
          }
        })}
    </li>
  );
};

const ThreadMessageList: React.FC<ChatViewProps> = ({ messages }) => {
  const theme = useTheme();
  const messagesListRef = useRef<HTMLUListElement | null>(null);

  return (
    <div css={styles(theme)}>
      <ul className="messages" ref={messagesListRef}>
        {messages.map(MessageView)}
      </ul>
    </div>
  );
};

export default memo(ThreadMessageList, isEqual);

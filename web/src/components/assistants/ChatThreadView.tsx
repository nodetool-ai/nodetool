/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import React, { useRef, useEffect, useCallback, useState } from "react";
import { LinearProgress, Typography, Button } from "@mui/material";
import {
  Message,
  MessageContent,
  MessageTextContent,
  MessageImageContent
} from "../../stores/ApiTypes";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import OutputRenderer from "../node/OutputRenderer";

const pulse = keyframes`
  0% { transform: scale(0.8); opacity: 0.5; }
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(0.8); opacity: 0.5; }
`;

const textPulse = keyframes`
  0% { opacity: 0.7; }
  50% { opacity: 1; }
  100% { opacity: 0.7; }
`;

const styles = (theme: any) =>
  css({
    width: "100%",
    flexGrow: 1,
    overflowY: "auto",
    listStyleType: "none",
    padding: ".5em",
    marginBottom: "1em",
    paddingRight: "2em",
    borderRadius: "1em",
    marginRight: "1em",
    backgroundColor: theme.palette.c_gray1,

    "li.chat-message": {
      width: "100%",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      listStyleType: "none",
      marginBottom: "1em",
      padding: "0.5em 1em",
      borderRadius: "4px"
    },

    "li.chat-message p": {
      margin: "0.2em 0",
      fontSize: theme.fontSizeNormal,
      lineHeight: "1.5em",
      fontWeight: "300",
      color: theme.palette.c_white
    },

    "li.user": {
      width: "60%",
      marginLeft: "auto",
      color: theme.palette.c_gray6,
      backgroundColor: theme.palette.c_gray3,
      borderRadius: "20px"
    },

    "li .markdown": {
      padding: 0
    },

    "li.assistant": {
      color: theme.palette.c_white
    },

    "li pre": {
      fontFamily: theme.fontFamily2,
      backgroundColor: "rgba(0,0,0, 0.8)",
      padding: "0.5em"
    },

    "li pre code": {
      fontFamily: theme.fontFamily2,
      color: theme.palette.c_white
    },

    "li a": {
      color: theme.palette.c_hl1
    },

    "li a:hover": {
      color: `${theme.c_gray4} !important`
    },

    ".loading-container": {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      padding: "20px 0"
    },

    ".loading-dots": {
      display: "flex",
      justifyContent: "center",
      alignItems: "center"
    },

    ".dot": {
      width: "10px",
      height: "10px",
      borderRadius: "50%",
      backgroundColor: theme.palette.c_gray6,
      margin: "0 5px"
    },

    ".node-status": {
      textAlign: "center",
      color: theme.palette.c_gray6,
      fontSize: theme.fontSizeSmall,
      margin: "0.5em 0"
    },

    ".node-progress": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      margin: "2em 0"
    },

    ".progress-bar": {
      width: "80%",
      marginBottom: "0.5em"
    }
  });

interface ProgressProps {
  progress: number;
  total: number;
}

const Progress: React.FC<ProgressProps> = ({ progress, total }) => {
  const [eta, setEta] = useState<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }

    const remainingItems = total - progress;
    const elapsedTime = Date.now() - (startTimeRef.current || Date.now());
    const itemsPerMs = progress / elapsedTime;
    const remainingTimeMs = remainingItems / itemsPerMs;
    const etaSeconds = Math.round(remainingTimeMs / 1000);
    setEta(etaSeconds);
  }, [progress, total]);

  return (
    <div className="node-progress">
      <div className="progress-bar">
        <LinearProgress
          variant="determinate"
          value={(progress * 100) / total}
          color="primary"
        />
      </div>
      <Typography variant="caption">{eta && `ETA: ${eta}s`}</Typography>
    </div>
  );
};

const LoadingIndicator: React.FC = () => {
  return (
    <div className="loading-container">
      <div className="loading-dots">
        <div
          className="dot"
          css={css`
            animation: ${pulse} 1.4s infinite ease-in-out;
          `}
        />
      </div>
    </div>
  );
};

interface MessageViewProps {
  message: Message;
  expandedThoughts: { [key: string]: boolean };
  onToggleThought: (key: string) => void;
}

const MessageView: React.FC<MessageViewProps> = ({
  message,
  expandedThoughts,
  onToggleThought
}) => {
  let messageClass = "chat-message";
  if (message.role === "user") {
    messageClass += " user";
  } else if (message.role === "assistant") {
    messageClass += " assistant";
  }

  const renderContent = (content: string, index: number) => {
    const thoughtMatch = content.match(/<think>([\s\S]*?)(<\/think>|$)/s);
    if (thoughtMatch) {
      const key = `thought-${message.id}-${index}`;
      const isExpanded = expandedThoughts[key];
      const hasClosingTag = thoughtMatch[2] === "</think>";
      const textBeforeThought = content.split("<think>")[0];
      const textAfterThought = hasClosingTag
        ? content.split("</think>").pop() || ""
        : "";

      return (
        <>
          {textBeforeThought && (
            <MarkdownRenderer content={textBeforeThought} />
          )}
          <div>
            <Button
              size="small"
              onClick={() => onToggleThought(key)}
              css={css`
                text-transform: none;
                color: inherit;
                opacity: 0.7;
                &:hover {
                  opacity: 1;
                }
                display: flex;
                align-items: center;
                gap: 8px;
              `}
            >
              {!hasClosingTag ? (
                <>
                  <div
                    css={css`
                      width: 8px;
                      height: 8px;
                      border-radius: 50%;
                      background-color: currentColor;
                      animation: ${pulse} 1.5s ease-in-out infinite;
                    `}
                  />
                  Show thought
                </>
              ) : (
                `${isExpanded ? "Hide thought" : "Show thought"}`
              )}
            </Button>
            {isExpanded && (
              <div
                css={css`
                  margin-left: 1em;
                  margin-top: 0.5em;
                  padding: 0.5em;
                  background: rgba(0, 0, 0, 0.2);
                  border-radius: 4px;
                `}
              >
                <MarkdownRenderer content={thoughtMatch[1]} />
              </div>
            )}
            {textAfterThought && (
              <MarkdownRenderer content={textAfterThought} />
            )}
          </div>
        </>
      );
    }
    return <MarkdownRenderer content={content} />;
  };

  const content = message.content as
    | Array<MessageTextContent | MessageImageContent>
    | string;

  return (
    <li className={messageClass}>
      {typeof message.content === "string" &&
        renderContent(
          message.content,
          typeof message.id === "string" ? parseInt(message.id) || 0 : 0
        )}
      {Array.isArray(content) &&
        content.map((c: MessageContent, i: number) => {
          if (c.type === "text") {
            return <div key={i}>{renderContent(c.text || "", i)}</div>;
          } else if (c.type === "image_url") {
            return <OutputRenderer key={i} value={c.image} />;
          } else if (c.type === "audio") {
            return <OutputRenderer key={i} value={c.audio} />;
          } else if (c.type === "video") {
            return <OutputRenderer key={i} value={c.video} />;
          } else if (c.type === "document") {
            return <OutputRenderer key={i} value={c.document} />;
          }
          return null;
        })}
    </li>
  );
};

interface ChatThreadViewProps {
  messages: Message[];
  status: "disconnected" | "connecting" | "connected" | "loading" | "error";
  progress: number;
  total: number;
  progressMessage: string | null;
}

const ChatThreadView: React.FC<ChatThreadViewProps> = ({
  messages,
  status,
  progress,
  total,
  progressMessage
}) => {
  const messagesListRef = useRef<HTMLUListElement | null>(null);
  const [expandedThoughts, setExpandedThoughts] = useState<{
    [key: string]: boolean;
  }>({});
  const [loadingThoughts, setLoadingThoughts] = useState<{
    [key: string]: boolean;
  }>({});

  const scrollToBottom = useCallback(() => {
    if (messagesListRef.current) {
      const messagesList = messagesListRef.current;
      const lastMessage = messagesList.lastChild as HTMLLIElement;
      if (lastMessage) {
        lastMessage.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleToggleThought = useCallback((key: string) => {
    setLoadingThoughts((prev) => ({ ...prev, [key]: true }));

    setTimeout(() => {
      setExpandedThoughts((prev) => ({
        ...prev,
        [key]: !prev[key]
      }));
      setLoadingThoughts((prev) => ({ ...prev, [key]: false }));
    }, 500);
  }, []);

  return (
    <ul className="chat-messages" ref={messagesListRef} css={styles}>
      {messages.map((msg, index) => (
        <MessageView
          key={msg.id || `msg-${index}`}
          message={msg}
          expandedThoughts={expandedThoughts}
          onToggleThought={handleToggleThought}
        />
      ))}
      {status === "loading" && progress === 0 && (
        <li key="loading-indicator">
          <LoadingIndicator />
        </li>
      )}
      {progress > 0 && (
        <li key="progress-indicator">
          <Progress progress={progress} total={total} />
        </li>
      )}
      {progressMessage && (
        <li key="progress-message" className="node-status">
          <span
            css={css`
              display: inline;
              animation: ${textPulse} 1.8s ease-in-out infinite;
            `}
          >
            {progressMessage}
          </span>
        </li>
      )}
    </ul>
  );
};

export default ChatThreadView;
export { Progress };

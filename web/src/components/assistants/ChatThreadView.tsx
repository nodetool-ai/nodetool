/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import React, { useRef, useEffect, useCallback, useState } from "react";
import { LinearProgress, Typography, Button, IconButton } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
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

const styles = (theme: any) => ({
  chatThreadViewRoot: css({
    width: "100%",
    flexGrow: 1,
    position: "relative",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    marginBottom: "1em"
  }),
  scrollableMessageWrapper: css({
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    alignItems: "center",
    overflowY: "auto",
    backgroundColor: theme.palette.c_gray1,
    borderRadius: "1em",
    padding: "0 .5em",
    position: "relative"
  }),
  chatMessagesList: css({
    listStyleType: "none",
    maxWidth: "1000px",
    padding: "2em 0 0",
    margin: "0",

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
      padding: "0.2em",
      color: theme.palette.c_gray6,
      backgroundColor: theme.palette.c_gray2,
      opacity: 0.9,
      borderRadius: "20px"
    },

    "li .markdown": {
      padding: "1em"
    },

    "li.assistant": {
      color: theme.palette.c_white
    },

    "li pre": {
      fontFamily: theme.fontFamily2,
      width: "100%",
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
  }),
  scrollToBottomButton: css({
    position: "absolute",
    bottom: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 10,
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    padding: 0,
    backgroundColor: theme.palette.c_gray3,
    color: theme.palette.c_white,
    transition: "opacity 0.4s ease",
    "&:hover": {
      backgroundColor: `${theme.palette.c_gray4} !important`
    },
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  })
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
  const theme = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedThoughts, setExpandedThoughts] = useState<{
    [key: string]: boolean;
  }>({});
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);

  const SCROLL_THRESHOLD = 50;

  const componentStyles = styles(theme);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (element) {
      const nearBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight <
        SCROLL_THRESHOLD;
      setIsNearBottom(nearBottom);
      if (!nearBottom && !userHasScrolledUp) {
        setUserHasScrolledUp(true);
      } else if (nearBottom && userHasScrolledUp) {
        setUserHasScrolledUp(false);
      }
    }
  }, [userHasScrolledUp]);

  const scrollToBottom = useCallback(
    (force = false) => {
      if (scrollRef.current) {
        if (force || isNearBottom) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          setUserHasScrolledUp(false);
          setIsNearBottom(true);
        }
      }
    },
    [isNearBottom]
  );

  useEffect(() => {
    const element = scrollRef.current;
    if (element) {
      element.addEventListener("scroll", handleScroll);
      return () => {
        element.removeEventListener("scroll", handleScroll);
      };
    }
  }, [handleScroll]);

  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "user") {
        scrollToBottom(true);
        return;
      }
    }
    if (status === "loading" || status === "connected" || messages.length > 0) {
      if (isNearBottom && !userHasScrolledUp) {
        scrollToBottom();
      }
    }
  }, [messages, status, scrollToBottom, isNearBottom, userHasScrolledUp]);

  const handleToggleThought = useCallback((key: string) => {
    setExpandedThoughts((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return (
    <div
      css={componentStyles.chatThreadViewRoot}
      className="chat-thread-view-root"
    >
      <div
        ref={scrollRef}
        css={componentStyles.scrollableMessageWrapper}
        className="scrollable-message-wrapper"
      >
        <ul
          css={componentStyles.chatMessagesList}
          className="chat-messages-list"
        >
          {messages.map((msg, index) => (
            <MessageView
              key={msg.id || `msg-${index}`}
              message={msg}
              expandedThoughts={expandedThoughts}
              onToggleThought={handleToggleThought}
            />
          ))}
          {status === "loading" && progress === 0 && (
            <li key="loading-indicator" className="chat-message-list-item">
              <LoadingIndicator />
            </li>
          )}
          {progress > 0 && (
            <li key="progress-indicator" className="chat-message-list-item">
              <Progress progress={progress} total={total} />
            </li>
          )}
          {progressMessage && (
            <li
              key="progress-message"
              className="node-status chat-message-list-item"
            >
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
      </div>
      <IconButton
        css={componentStyles.scrollToBottomButton}
        className="scroll-to-bottom-button"
        onClick={() => scrollToBottom(true)}
        size="small"
        style={{
          opacity: isNearBottom ? 0 : 0.8,
          pointerEvents: isNearBottom ? "none" : "auto"
        }}
        disableRipple
      >
        <ArrowDownwardIcon />
      </IconButton>
    </div>
  );
};

export default ChatThreadView;
export { Progress };

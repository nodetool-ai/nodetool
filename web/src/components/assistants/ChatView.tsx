/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { LinearProgress, Typography } from "@mui/material";
// mui
import { Button, TextareaAutosize, Tooltip } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";

// store
import {
  MessageImageContent,
  MessageTextContent,
  Message,
  MessageContent
} from "../../stores/ApiTypes";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
// utils
import MarkdownRenderer from "../../utils/MarkdownRenderer";
// constants
import { TOOLTIP_DELAY } from "../../config/constants";
import OutputRenderer from "../node/OutputRenderer";
import { useTutorialStore } from "../../stores/TutorialStore";

const styles = (theme: any) =>
  css({
    "&": {
      height: "100%",
      width: "100%"
    },
    ".messages": {
      overflowY: "auto",
      listStyleType: "none",
      maxHeight: "500px",
      padding: "0px"
    },
    ".messages li.chat-message": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      listStyleType: "none",
      marginBottom: "1em",
      padding: "0.3em",
      borderRadius: "0.5em"
    },
    ".messages li.chat-message p": {
      margin: "0.2em 0"
    },
    ".messages li.user": {
      color: theme.palette.c_gray5,
      backgroundColor: theme.palette.c_gray2,
      borderLeft: `1px solid ${theme.palette.c_hl1}`,
      marginLeft: "10%"
    },
    ".messages li.assistant": {
      color: theme.palette.c_white,
      backgroundColor: theme.palette.c_black,
      borderRight: `1px solid ${theme.palette.c_hl2}`,
      marginRight: "10%"
    },
    ".messages li pre": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      backgroundColor: theme.palette.c_black,
      padding: "0.5em"
    },
    ".messages li pre code": {
      fontFamily: theme.fontFamily2,
      color: theme.palette.c_white
    },
    ".messages li a": {
      color: theme.palette.c_hl1
    },
    ".messages li a:hover": {
      color: `${theme.c_gray4} !important`
    },
    ".chat-window .chat-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      height: "2px"
    },
    ".chat-window .chat-header h6": {
      marginTop: "14px",
      marginLeft: "10px"
    },
    ".compose-message": {
      position: "relative",
      height: "auto",
      width: "100%",
      backgroundColor: theme.palette.c_gray1,
      border: "1px solid",
      borderColor: theme.palette.c_gray3,
      display: "flex",
      alignItems: "center",
      borderRadius: "20px",
      padding: "0",
      boxShadow: "0 2px 6px rgba(0, 0, 0, 0.1)"
    },
    ".compose-message textarea": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      backgroundColor: "transparent",
      color: theme.palette.c_white,
      border: "none",
      resize: "none",
      overflowY: "auto",
      width: "calc(100% - 48px)",
      height: "100%",
      flexGrow: 1,
      padding: "1em 2em",
      "&::placeholder": {
        color: theme.palette.c_gray3
      }
    },
    ".compose-message button": {
      position: "absolute",
      right: "8px",
      backgroundColor: "transparent",
      color: theme.palette.c_hl1,
      padding: "8px",
      minWidth: "unset",
      borderRadius: "50%",
      transition: "transform 0.2s ease-in-out",
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.1)",
        transform: "scale(1.1)"
      }
    },
    ".compose-message-label": {
      color: theme.palette.c_gray3,
      margin: "-2em 1em 1em",
      padding: "0 1em"
    },
    "button.scroll-to-bottom": {
      left: 0,
      right: 0,
      position: "absolute",
      top: "-27px",
      bottom: "unset",
      background: "transparent"
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
      backgroundColor: theme.palette.c_hl1,
      margin: "0 5px"
    },
    ".node-status": {
      textAlign: "center",
      color: theme.palette.c_gray3,
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

const bounce = keyframes`
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
`;

type ChatViewProps = {
  status: "disconnected" | "connecting" | "connected" | "loading" | "error";
  currentNodeName: string | null;
  progress: number;
  total: number;
  messages: Array<Message>;
  sendMessage: (prompt: string) => Promise<void>;
};
export const Progress = ({
  progress,
  total
}: {
  progress: number;
  total: number;
}) => {
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

const ChatView = ({
  status,
  currentNodeName,
  progress,
  total,
  messages,
  sendMessage
}: ChatViewProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesListRef = useRef<HTMLUListElement | null>(null);
  const { metaKeyPressed, altKeyPressed, shiftKeyPressed } = useKeyPressedStore(
    (state) => ({
      metaKeyPressed: state.isKeyPressed("Meta"),
      altKeyPressed: state.isKeyPressed("Alt"),
      shiftKeyPressed: state.isKeyPressed("Shift")
    })
  );
  const [submitted, setSubmitted] = useState(false);
  const [prompt, setPrompt] = useState("");
  const loading = false;
  const { isInTutorial } = useTutorialStore();

  const handleOnChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setPrompt(event.target.value);
    },
    []
  );

  useEffect(() => {
    if (submitted && !loading) {
      setSubmitted(false);
    }
  }, [loading, submitted]);

  const chatPost = useCallback(() => {
    setSubmitted(true);

    if (!loading && prompt.length > 0) {
      try {
        setPrompt("");
        sendMessage(prompt);
      } catch (error) {
        console.error("Error sending message:", error);
      }
    }
  }, [loading, prompt, sendMessage]);

  const scrollToBottom = useCallback(() => {
    if (messagesListRef.current) {
      const messagesList = messagesListRef.current;
      const lastMessage = messagesList.lastChild as HTMLLIElement;
      if (lastMessage) {
        lastMessage.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messagesListRef]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const LoadingIndicator = useCallback(() => {
    return (
      <div className="loading-container">
        <div className="loading-dots">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="dot"
              css={css`
                animation: ${bounce} 1.4s infinite ease-in-out;
                animation-delay: ${i * 0.16}s;
              `}
            />
          ))}
        </div>
      </div>
    );
  }, []);

  const MessageView = useCallback(
    (msg: Message) => {
      let messageClass = "chat-message";

      if (msg.role === "user") {
        messageClass += " user";
      } else if (msg.role === "assistant") {
        messageClass += " assistant";
      }

      if (isInTutorial && msg.role === "assistant") {
        messageClass += " tutorial-step";
      }

      const content = msg.content as
        | Array<MessageTextContent | MessageImageContent>
        | string;
      return (
        <li className={messageClass} key={msg.id}>
          {typeof msg.content === "string" && (
            <MarkdownRenderer key={msg.id} content={msg.content || ""} />
          )}
          {Array.isArray(content) &&
            content.map((c: MessageContent, i: number) => {
              if (c.type === "text") {
                return <MarkdownRenderer key={msg.id} content={c.text || ""} />;
              } else if (c.type === "image_url") {
                return <OutputRenderer key={i} value={c.image} />;
              } else if (c.type === "audio") {
                return <OutputRenderer key={i} value={c.audio} />;
              } else if (c.type === "video") {
                return <OutputRenderer key={i} value={c.video} />;
              } else {
                return <></>;
              }
            })}
        </li>
      );
    },
    [isInTutorial]
  );

  return (
    <div css={styles}>
      <ul className="messages" ref={messagesListRef}>
        {messages.map((msg, index) => (
          <MessageView key={msg.id || `msg-${index}`} {...msg} />
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
        {currentNodeName && (
          <li key="node-status" className="node-status">
            running {currentNodeName}...
          </li>
        )}
      </ul>

      <div className="chat-controls">
        <div className="compose-message">
          <TextareaAutosize
            id={"chat-prompt"}
            aria-labelledby="chat-prompt"
            ref={textareaRef}
            value={prompt}
            onChange={handleOnChange}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                status === "connected" &&
                !metaKeyPressed &&
                !altKeyPressed &&
                !shiftKeyPressed
              ) {
                e.preventDefault();
                chatPost();
              }
            }}
            disabled={submitted}
            minRows={1}
            maxRows={4}
            placeholder="Type your message..."
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck="false"
            autoComplete="off"
          />
          <Tooltip
            enterDelay={TOOLTIP_DELAY}
            title={
              <div style={{ textAlign: "center" }}>
                <Typography variant="inherit">Send Message</Typography>
                <Typography variant="inherit">[Enter]</Typography>
              </div>
            }
          >
            <>
              <Button
                disabled={status !== "connected" || prompt.trim() === ""}
                onClick={() => {
                  if (!submitted) {
                    chatPost();
                  }
                }}
              >
                <SendIcon fontSize="small" />
              </Button>
            </>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

export default ChatView;

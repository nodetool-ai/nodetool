/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useRef, useState, useEffect, useCallback } from "react";
// mui
import {
  Button,
  CircularProgress,
  TextareaAutosize,
  Tooltip,
  Typography
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";

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
// import { useAuth } from "../../stores/useAuth";

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
      padding: "14px"
    },
    ".messages li.chat-message": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeNormal,
      listStyleType: "none"
    },
    ".messages li.chat-message p": {
      margin: "0.3em 0"
    },
    ".messages li.user": {
      color: theme.palette.c_gray5,
      borderBottom: `1px solid ${theme.palette.c_gray2}`,
      padding: "0.1em 0.2em 0",
      margin: "2em 0 1em 0"
    },
    ".messages li.assistant": {
      color: theme.palette.c_white
    },
    ".messages li pre": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      backgroundColor: theme.palette.c_black,
      padding: "1em"
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
      height: "25px"
    },
    ".chat-window .chat-header h6": {
      marginTop: "14px",
      marginLeft: "10px"
    },
    ".compose-message": {
      height: "auto",
      width: "100%",
      backgroundColor: theme.palette.c_gray1,
      display: "flex"
    },
    ".compose-message textarea": {
      position: "relative",
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeNormal,
      backgroundColor: theme.palette.c_gray1,
      color: theme.palette.c_white,
      padding: "0.5em 1em",
      border: `1px solid ${theme.palette.c_gray2}`,
      resize: "none",
      overflowY: "auto",
      margin: "0.5em",
      width: "calc(100% - 38px)" /* Subtract the width of the button */,
      height: "100%",
      flexGrow: 1,
      borderRadius: "5px"
    },
    ".compose-message textarea:focus, .compose-message textarea:active": {
      outline: 0,
      border: `1px solid ${theme.c_gray3} !important`
    },
    ".compose-message button": {
      position: "relative",
      backgroundColor: theme.palette.c_gray2,
      flexGrow: 0,
      top: "8px",
      height: "38px",
      width: "38px"
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
    }
  });

type ChatViewProps = {
  messages: Array<Message>;
  showMessages?: boolean;
  setShowMessages?: (show: boolean) => void;
  sendMessage: (prompt: string, token: string) => Promise<void>;
};

const MessageView = (msg: Message) => {
  let messageClass = "chat-message";

  if (msg.role === "user") {
    messageClass += " user";
  } else if (msg.role === "assistant") {
    messageClass += " assistant";
  }
  const content = msg.content as
    | Array<MessageTextContent | MessageImageContent>
    | string;
  return (
    <li className={messageClass} key={msg.id}>
      {typeof msg.content === "string" && (
        <Typography>{msg.content}</Typography>
      )}
      {Array.isArray(content) &&
        content.map((c: MessageContent, i: number) => {
          if (c.type === "text") {
            return <MarkdownRenderer key={msg.id} content={c.text || ""} />;
          } else if (c.type === "image_url") {
            return <img key={i} src={c.image_url?.url} alt="" />;
          } else {
            return <></>;
          }
        })}
    </li>
  );
};

const ChatView = ({
  messages,
  showMessages,
  setShowMessages
}: ChatViewProps) => {
  const { isKeyPressed } = useKeyPressedStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesListRef = useRef<HTMLUListElement | null>(null);
  const metaKeyPressed = isKeyPressed("Meta");
  const altKeyPressed = isKeyPressed("Alt");
  const shiftkeyPressed = isKeyPressed("Shift");
  const [submitted, setSubmitted] = useState(false);
  // const readFromStorage = useAuth((state) => state.readFromStorage);
  // const user = readFromStorage();
  const [prompt, setPrompt] = useState("");
  const loading = false;

  // handle input change
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

  // post message
  const chatPost = useCallback(() => {
    setShowMessages?.(true);
    setSubmitted(true);

    if (!loading && prompt.length > 0) {
      try {
        setPrompt("");
        // sendMessage(prompt, user?.auth_token || "");
      } catch (error) {
        console.error("Error sending help message:", error);
      }
    }
  }, [loading, prompt, setShowMessages]);

  // scroll to bottom
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

  return (
    <div css={styles}>
      {showMessages && (
        <ul className="messages" ref={messagesListRef}>
          {messages.map(MessageView)}
          {loading && <CircularProgress size={24} />}
        </ul>
      )}

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
                !metaKeyPressed &&
                !altKeyPressed &&
                !shiftkeyPressed
              ) {
                e.preventDefault();
                chatPost();
              }
            }}
            onFocus={() => setShowMessages?.(true)}
            disabled={submitted}
            minRows={1}
            maxRows={8}
            placeholder="message ..."
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
                disabled={loading || submitted}
                onClick={() => {
                  if (!submitted) {
                    chatPost();
                  }
                }}
              >
                <ArrowUpwardIcon />
              </Button>
            </>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

export default ChatView;

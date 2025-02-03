/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { LinearProgress, Typography } from "@mui/material";
// mui
import { Button, TextareaAutosize, Tooltip } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import FileIcon from "@mui/icons-material/InsertDriveFile";

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
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import OutputRenderer from "../node/OutputRenderer";

const styles = (theme: any) =>
  css({
    "&": {
      position: "relative",
      height: "100%",
      width: "100%",
      display: "flex",
      flexGrow: 1,
      flexDirection: "column"
    },
    ".messages": {
      width: "100%",
      flexGrow: 1,
      overflowY: "auto",
      listStyleType: "none",
      padding: ".5em",
      margin: "0"
    },
    ".messages li.chat-message": {
      width: "100%",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      listStyleType: "none",
      marginBottom: "1em",
      padding: "0.5em 1em",
      borderRadius: "4px"
    },
    ".messages li.chat-message p": {
      margin: "0.2em 0",
      fontSize: theme.fontSizeBig
    },
    ".messages li.user": {
      color: theme.palette.c_gray6,
      backgroundColor: "rgba(0,0,0, 0.9)",
      borderRight: "2px solid" + theme.palette.c_gray3
    },
    ".messages li .markdown": {
      padding: 0
    },
    ".messages li.assistant": {
      color: theme.palette.c_white
    },
    ".messages li pre": {
      fontFamily: theme.fontFamily2,
      backgroundColor: "rgba(0,0,0, 0.8)",
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
      width: "100%",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      height: "2px"
    },
    ".chat-window .chat-header h6": {
      marginTop: "14px",
      marginLeft: "10px"
    },
    ".chat-controls": {
      position: "relative",
      bottom: 0,
      padding: "0 1em",
      marginTop: "auto",
      zIndex: 1
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
      borderRadius: ".5em",
      boxShadow: "0 2px 6px rgba(0, 0, 0, 0.1)"
    },
    ".compose-message textarea": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      backgroundColor: "transparent",
      color: theme.palette.c_white,
      resize: "none",
      overflowY: "auto",
      width: "calc(100% - 190px)",
      height: "100%",
      flexGrow: 1,
      outline: "none",
      border: "1px solid transparent",
      borderRadius: ".5em",
      padding: ".5em 1em",
      transition: "border 0.2s ease-in-out",
      "&::placeholder": {
        color: theme.palette.c_gray3
      },
      "&:focus": {
        border: "1px solid" + theme.palette.c_gray5
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
    },
    ".compose-message.dragging": {
      borderColor: theme.palette.c_hl1,
      backgroundColor: `${theme.palette.c_gray2}80`
    }
  });

const bounce = keyframes`
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
`;

const pulse = keyframes`
  0% { transform: scale(0.8); opacity: 0.5; }
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(0.8); opacity: 0.5; }
`;

type ChatViewProps = {
  status: "disconnected" | "connecting" | "connected" | "loading" | "error";
  currentNodeName: string | null;
  progress: number;
  total: number;
  messages: Array<Message>;
  sendMessage: (message: Message) => Promise<void>;
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

// Add new type for dropped files
type DroppedFile = {
  dataUri: string;
  type: string;
  name: string;
};

const DOC_TYPES_REGEX =
  /application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.*|application\/vnd\.ms-.*|application\/vnd\.apple\.*|application\/x-iwork.*/;

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
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<DroppedFile[]>([]);

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

  const makeMessageContent = (file: DroppedFile): MessageContent => {
    if (file.type.startsWith("image/")) {
      return {
        type: "image_url",
        image: {
          type: "image",
          uri: file.dataUri
        }
      };
    } else if (file.type.startsWith("audio/")) {
      return {
        type: "audio",
        audio: {
          type: "audio",
          uri: file.dataUri
        }
      };
    } else if (file.type.startsWith("video/")) {
      return {
        type: "video",
        video: {
          type: "video",
          uri: file.dataUri
        }
      };
    } else if (file.type.match(DOC_TYPES_REGEX)) {
      return {
        type: "document",
        document: {
          type: "document",
          uri: file.dataUri
        }
      };
    } else {
      return {
        type: "text",
        text: file.name
      };
    }
  };

  const chatPost = useCallback(() => {
    setSubmitted(true);

    if (!loading && prompt.length > 0) {
      try {
        setPrompt("");
        const content: MessageContent[] = [
          {
            type: "text",
            text: prompt
          }
        ];

        const fileContents: MessageContent[] =
          droppedFiles.map(makeMessageContent);

        sendMessage({
          type: "message",
          name: "",
          role: "user",
          content: [...content, ...fileContents]
        });
        setDroppedFiles([]);
      } catch (error) {
        console.error("Error sending message:", error);
      }
    }
  }, [loading, prompt, sendMessage, droppedFiles]);

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

  const MessageView = useCallback((msg: Message) => {
    const [expandedThoughts, setExpandedThoughts] = useState<{
      [key: string]: boolean;
    }>({});
    const [loadingThoughts, setLoadingThoughts] = useState<{
      [key: string]: boolean;
    }>({});

    let messageClass = "chat-message";
    if (msg.role === "user") {
      messageClass += " user";
    } else if (msg.role === "assistant") {
      messageClass += " assistant";
    }

    const toggleThought = (key: string) => {
      setLoadingThoughts((prev) => ({ ...prev, [key]: true }));

      setTimeout(() => {
        setExpandedThoughts((prev) => ({
          ...prev,
          [key]: !prev[key]
        }));
        setLoadingThoughts((prev) => ({ ...prev, [key]: false }));
      }, 500);
    };

    const renderContent = (content: string, index: number) => {
      const thoughtMatch = content.match(/<think>([\s\S]*?)(<\/think>|$)/s);
      if (thoughtMatch) {
        const key = `thought-${index}`;
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
                onClick={() => toggleThought(key)}
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

    const content = msg.content as
      | Array<MessageTextContent | MessageImageContent>
      | string;
    return (
      <li className={messageClass} key={msg.id}>
        {typeof msg.content === "string" &&
          renderContent(
            msg.content,
            typeof msg.id === "string" ? parseInt(msg.id) || 0 : 0
          )}
        {Array.isArray(content) &&
          content.map((c: MessageContent, i: number) => {
            if (c.type === "text") {
              return renderContent(c.text || "", i);
            } else if (c.type === "image_url") {
              return <OutputRenderer key={i} value={c.image} />;
            } else if (c.type === "audio") {
              return <OutputRenderer key={i} value={c.audio} />;
            } else if (c.type === "video") {
              return <OutputRenderer key={i} value={c.video} />;
            } else if (c.type === "document") {
              return <OutputRenderer key={i} value={c.document} />;
            } else {
              return <></>;
            }
          })}
      </li>
    );
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const filePromises = files.map((file) => {
      return new Promise<DroppedFile>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            dataUri: reader.result as string,
            type: file.type,
            name: file.name
          });
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(filePromises).then((newFiles) => {
      setDroppedFiles((prev) => [...prev, ...newFiles]);
    });
  }, []);

  // Add file preview component
  const FilePreview = ({
    file,
    onRemove
  }: {
    file: DroppedFile;
    onRemove: () => void;
  }) => (
    <div
      css={css`
        position: relative;
        padding: 8px;
        max-width: 100px;

        .remove-button {
          position: absolute;
          top: 0;
          right: 0;
          padding: 2px;
          background: rgba(0, 0, 0, 0.5);
          border-radius: 50%;
          cursor: pointer;
          color: white;
          &:hover {
            background: rgba(0, 0, 0, 0.8);
          }
        }
      `}
    >
      {file.type.startsWith("image/") ? (
        <img
          src={file.dataUri}
          alt={file.name}
          css={css`
            width: 100%;
            height: auto;
            border-radius: 4px;
          `}
        />
      ) : (
        <div
          css={css`
            background: rgba(255, 255, 255, 0.1);
            padding: 8px;
            border-radius: 4px;
            text-align: center;
          `}
        >
          <FileIcon />
          <div
            css={css`
              font-size: 0.8em;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            `}
          >
            {file.name}
          </div>
        </div>
      )}
      <div className="remove-button" onClick={onRemove}>
        ×
      </div>
    </div>
  );

  return (
    <div className="chat-view" css={styles}>
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
        <div
          className={`compose-message ${isDragging ? "dragging" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {droppedFiles.length > 0 && (
            <div
              css={css`
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                padding: 8px;
              `}
            >
              {droppedFiles.map((file, index) => (
                <FilePreview
                  key={index}
                  file={file}
                  onRemove={() => {
                    setDroppedFiles((files) =>
                      files.filter((_, i) => i !== index)
                    );
                  }}
                />
              ))}
            </div>
          )}
          <TextareaAutosize
            className="chat-input"
            id={"chat-prompt"}
            aria-labelledby="chat-prompt"
            ref={textareaRef}
            value={prompt}
            onChange={handleOnChange}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (shiftKeyPressed) {
                  e.preventDefault();
                  setPrompt(prompt + "\n");
                  return;
                }
                if (
                  status === "connected" &&
                  !metaKeyPressed &&
                  !altKeyPressed
                ) {
                  e.preventDefault();
                  chatPost();
                }
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
            enterDelay={TOOLTIP_ENTER_DELAY}
            title={
              <div style={{ textAlign: "center" }}>
                <Typography variant="inherit">Send Message</Typography>
                <Typography variant="inherit">[Enter]</Typography>
              </div>
            }
          >
            <Button
              className="chat-send-button"
              onClick={() => {
                if (
                  !submitted &&
                  !(status !== "connected" || prompt.trim() === "")
                ) {
                  chatPost();
                }
              }}
              sx={{
                marginTop: "0.25em",
                "& .MuiSvgIcon-root": {
                  filter: prompt.trim() === "" ? "saturate(0)" : "none"
                }
              }}
            >
              <SendIcon fontSize="small" />
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

export default ChatView;

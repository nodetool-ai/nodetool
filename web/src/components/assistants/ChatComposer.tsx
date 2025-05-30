/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useRef, useState, useCallback } from "react";
import { Button, TextareaAutosize, Tooltip, Typography } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import FileIcon from "@mui/icons-material/InsertDriveFile";
import { MessageContent } from "../../stores/ApiTypes";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const styles = (theme: any) =>
  css({
    ".compose-message": {
      position: "relative",
      height: "auto",
      width: "100%",
      backgroundColor: theme.palette.c_gray2,
      border: "1px solid",
      borderColor: theme.palette.c_gray1,
      display: "flex",
      borderRadius: "12px",
      boxShadow: "0 2px 6px rgba(0, 0, 0, 0.1)",
      flexDirection: "column",
      alignItems: "stretch",

      "&.dragging": {
        borderColor: theme.palette.c_hl1,
        backgroundColor: `${theme.palette.c_gray2}80`
      }
    },

    ".compose-message textarea": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      backgroundColor: "transparent",
      color: theme.palette.c_white,
      resize: "none",
      overflowY: "auto",
      width: "calc(100% - 60px)",
      height: "100%",
      flexGrow: 1,
      outline: "none",
      border: "1px solid transparent",
      borderRadius: "12px",
      padding: "1em 1em",
      margin: "0",
      transition: "border 0.2s ease-in-out",
      "&::placeholder": {
        color: theme.palette.c_gray3
      },
      "&:focus": {
        border: "1px solid" + theme.palette.c_gray3
      }
    },

    ".compose-message button": {
      position: "absolute",
      right: "8px",
      bottom: "8px",
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

    ".file-preview-container": {
      display: "flex",
      flexWrap: "wrap",
      gap: "8px",
      padding: "8px",
      borderBottom: `1px solid ${theme.palette.c_gray3}`
    },

    ".file-preview": {
      position: "relative",
      padding: "8px",
      maxWidth: "100px",

      ".remove-button": {
        position: "absolute",
        top: 0,
        right: 0,
        padding: "2px 6px",
        background: "rgba(0, 0, 0, 0.5)",
        borderRadius: "50%",
        cursor: "pointer",
        color: "white",
        fontSize: "16px",
        lineHeight: "1",
        "&:hover": {
          background: "rgba(0, 0, 0, 0.8)"
        }
      },

      img: {
        width: "100%",
        height: "auto",
        borderRadius: "4px"
      },

      ".file-icon-wrapper": {
        background: "rgba(255, 255, 255, 0.1)",
        padding: "8px",
        borderRadius: "4px",
        textAlign: "center",

        ".file-name": {
          fontSize: "0.8em",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }
      }
    }
  });

export type DroppedFile = {
  dataUri: string;
  type: string;
  name: string;
};

const DOC_TYPES_REGEX =
  /application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.*|application\/vnd\.ms-.*|application\/vnd\.apple\.*|application\/x-iwork.*/;

interface FilePreviewProps {
  file: DroppedFile;
  onRemove: () => void;
}

const FilePreview: React.FC<FilePreviewProps> = ({ file, onRemove }) => (
  <div className="file-preview">
    {file.type.startsWith("image/") ? (
      <img src={file.dataUri} alt={file.name} />
    ) : (
      <div className="file-icon-wrapper">
        <FileIcon />
        <div className="file-name">{file.name}</div>
      </div>
    )}
    <div className="remove-button" onClick={onRemove}>
      ×
    </div>
  </div>
);

interface ChatComposerProps {
  status: "disconnected" | "connecting" | "connected" | "loading" | "error";
  onSendMessage: (content: MessageContent[], prompt: string) => void;
  disabled?: boolean;
}

const ChatComposer: React.FC<ChatComposerProps> = ({
  status,
  onSendMessage,
  disabled = false
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<DroppedFile[]>([]);

  const { metaKeyPressed, altKeyPressed, shiftKeyPressed } = useKeyPressedStore(
    (state) => ({
      metaKeyPressed: state.isKeyPressed("Meta"),
      altKeyPressed: state.isKeyPressed("Alt"),
      shiftKeyPressed: state.isKeyPressed("Shift")
    })
  );

  const handleOnChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setPrompt(event.target.value);
    },
    []
  );

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

  const handleSend = useCallback(() => {
    if (status !== "loading" && prompt.length > 0) {
      const content: MessageContent[] = [
        {
          type: "text",
          text: prompt
        }
      ];

      const fileContents: MessageContent[] =
        droppedFiles.map(makeMessageContent);

      onSendMessage([...content, ...fileContents], prompt);
      setPrompt("");
      setDroppedFiles([]);
    }
  }, [status, prompt, droppedFiles, onSendMessage]);

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter") {
        if (shiftKeyPressed) {
          e.preventDefault();
          setPrompt(prompt + "\n");
          return;
        }
        if (status === "connected" && !metaKeyPressed && !altKeyPressed) {
          e.preventDefault();
          handleSend();
        }
      }
    },
    [status, prompt, shiftKeyPressed, metaKeyPressed, altKeyPressed, handleSend]
  );

  const removeFile = useCallback((index: number) => {
    setDroppedFiles((files) => files.filter((_, i) => i !== index));
  }, []);

  const isDisabled = disabled || status === "loading" || status === "error";

  return (
    <div css={styles}>
      <div
        className={`compose-message ${isDragging ? "dragging" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {droppedFiles.length > 0 && (
          <div className="file-preview-container">
            {droppedFiles.map((file, index) => (
              <FilePreview
                key={index}
                file={file}
                onRemove={() => removeFile(index)}
              />
            ))}
          </div>
        )}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "flex-end"
          }}
        >
          <TextareaAutosize
            className="chat-input"
            id="chat-prompt"
            aria-labelledby="chat-prompt"
            ref={textareaRef}
            value={prompt}
            onChange={handleOnChange}
            onKeyDown={handleKeyDown}
            disabled={isDisabled}
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
                if (!isDisabled && prompt.trim() !== "") {
                  handleSend();
                }
              }}
              sx={{
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

export default ChatComposer;

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { Box, Button, IconButton, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { relativeTime } from "../../utils/formatDateAndTime";

export interface ThreadInfo {
  id: string;
  title?: string;
  updatedAt: string;
  messages: Array<any>;
}

interface ThreadListProps {
  threads: Record<string, ThreadInfo> | null;
  currentThreadId: string | null;
  onNewThread: () => void;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  getThreadPreview: (id: string) => string;
}

const styles = (theme: any) =>
  css({
    width: "260px",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    backgroundColor: theme.palette.c_gray0,

    ".new-chat-section": { padding: theme.spacing(2) },

    ".new-chat-button": {
      width: "100%",
      padding: "0.5em 1em",
      borderRadius: "8px",
      backgroundColor: "var(--c_gray1)",
      color: theme.palette.c_white,
      textTransform: "none",
      justifyContent: "flex-start",
      transition: "background 0.2s",
      "&:hover": { backgroundColor: theme.palette.c_gray3 }
    },

    ".thread-list": {
      flex: 1,
      overflow: "auto",
      padding: 0,
      margin: 0,
      listStyle: "none"
    },

    ".thread-item": {
      position: "relative",
      padding: "0.75em 1em",
      borderLeft: `2px solid transparent`,
      cursor: "pointer",
      transition: "all 0.2s",

      "&:hover": {
        backgroundColor: theme.palette.c_gray2,
        ".delete-button": { opacity: 1 }
      },

      "&.selected": {
        backgroundColor: theme.palette.c_gray1,
        borderLeft: `2px solid ${theme.palette.c_hl1}`
      }
    },

    ".thread-title": {
      fontSize: theme.fontSizeSmall,
      fontWeight: "normal",
      color: theme.palette.c_white,
      marginBottom: "0.25em",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      paddingRight: "30px"
    },

    ".date": {
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.c_gray5
    },

    ".delete-button": {
      position: "absolute",
      right: "0.5em",
      top: "50%",
      transform: "translateY(-50%)",
      opacity: 0,
      padding: "4px",
      minWidth: "unset",
      color: theme.palette.c_gray5,
      transition: "opacity 0.2s",

      "&:hover": {
        color: theme.palette.c_error,
        backgroundColor: theme.palette.c_gray3
      },

      svg: { fontSize: "1.2em" }
    }
  });

const ThreadList: React.FC<ThreadListProps> = ({
  threads,
  currentThreadId,
  onNewThread,
  onSelectThread,
  onDeleteThread,
  getThreadPreview
}) => {
  const componentStyles = styles as any;
  return (
    <Box css={componentStyles}>
      <Box className="new-chat-section">
        <Tooltip title="New Chat">
          <Button
            className="new-chat-button"
            onClick={onNewThread}
            startIcon={<AddIcon />}
          >
            New Chat
          </Button>
        </Tooltip>
      </Box>
      <ul className="thread-list">
        {!threads || Object.keys(threads).length === 0 ? (
          <li
            style={{
              padding: "2em",
              textAlign: "center",
              color: "#666",
              fontSize: "0.9em"
            }}
          >
            No conversations yet. Click &ldquo;New Chat&rdquo; to start.
          </li>
        ) : (
          Object.entries(threads)
            .sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt))
            .map(([threadId, thread]) => (
              <li
                key={threadId}
                className={`thread-item ${
                  threadId === currentThreadId ? "selected" : ""
                }`}
                onClick={() => onSelectThread(threadId)}
              >
                <Typography className="thread-title">
                  {thread.title || getThreadPreview(threadId)}
                </Typography>
                <Typography className="date">
                  {relativeTime(thread.updatedAt)}
                </Typography>
                <IconButton
                  className="delete-button"
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteThread(threadId);
                  }}
                  data-microtip-position="left"
                  aria-label="Delete conversation"
                  role="tooltip"
                >
                  <DeleteIcon />
                </IconButton>
              </li>
            ))
        )}
      </ul>
    </Box>
  );
};

export default ThreadList;

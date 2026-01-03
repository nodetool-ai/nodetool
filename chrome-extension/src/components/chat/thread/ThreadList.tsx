/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useMemo } from "react";
import { Box, Typography, IconButton, List, ListItemButton, ListItemText, Tooltip } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import { format, isToday, isYesterday, isThisWeek } from "date-fns";
import type { Thread, ChatMessage } from "../../../types";

interface ThreadListProps {
  threads: Record<string, Thread>;
  messageCache: Record<string, ChatMessage[]>;
  currentThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
}

const containerStyles = css({
  display: "flex",
  flexDirection: "column",
  height: "100%",
  overflow: "hidden",
  backgroundColor: "#1a1a1a"
});

const headerStyles = css({
  padding: "12px 14px",
  borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  color: "rgba(255, 255, 255, 0.5)"
});

const listStyles = css({
  flex: 1,
  overflow: "auto",
  padding: "6px"
});

const threadItemStyles = (isActive: boolean) => css({
  borderRadius: "6px",
  marginBottom: "2px",
  padding: "8px 10px",
  backgroundColor: isActive ? "rgba(96, 165, 250, 0.1)" : "transparent",
  border: isActive ? "1px solid rgba(96, 165, 250, 0.2)" : "1px solid transparent",
  "&:hover": {
    backgroundColor: isActive ? "rgba(96, 165, 250, 0.12)" : "rgba(255, 255, 255, 0.03)"
  }
});

const emptyStateStyles = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  padding: "32px 20px"
});

const formatThreadDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  if (isToday(date)) {
    return format(date, "h:mm a");
  }
  if (isYesterday(date)) {
    return "Yesterday";
  }
  if (isThisWeek(date)) {
    return format(date, "EEEE");
  }
  return format(date, "MMM d");
};

const getThreadPreview = (messages: ChatMessage[]): string => {
  if (!messages || messages.length === 0) {
    return "New conversation";
  }
  const firstUserMessage = messages.find(msg => msg.role === "user");
  if (firstUserMessage) {
    const content = typeof firstUserMessage.content === "string"
      ? firstUserMessage.content
      : "[Media message]";
    return content.slice(0, 40) + (content.length > 40 ? "..." : "");
  }
  return "New conversation";
};

export function ThreadList({
  threads,
  messageCache,
  currentThreadId,
  onSelectThread,
  onDeleteThread
}: ThreadListProps) {
  // Memoize sorted threads to avoid repeated Date object creation
  const sortedThreads = useMemo(() => {
    return Object.values(threads)
      .map(thread => ({ ...thread, timestamp: new Date(thread.updated_at).getTime() }))
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [threads]);

  if (sortedThreads.length === 0) {
    return (
      <Box css={containerStyles}>
        <Box css={emptyStateStyles}>
          <ChatBubbleOutlineIcon sx={{ fontSize: 36, color: "rgba(255, 255, 255, 0.2)", mb: 1.5 }} />
          <Typography 
            variant="body2" 
            sx={{ 
              color: "rgba(255, 255, 255, 0.5)",
              fontSize: "13px",
              textAlign: "center"
            }}
          >
            No conversations yet
          </Typography>
          <Typography 
            variant="caption" 
            sx={{ 
              color: "rgba(255, 255, 255, 0.3)",
              fontSize: "11px",
              textAlign: "center",
              mt: 0.5
            }}
          >
            Start a new chat to begin
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box css={containerStyles}>
      <Box css={headerStyles}>
        Chat History
      </Box>
      <List css={listStyles} disablePadding>
        {sortedThreads.map(thread => {
          const isActive = thread.id === currentThreadId;
          const messages = messageCache[thread.id] || [];
          const preview = thread.title || getThreadPreview(messages);

          return (
            <ListItemButton
              key={thread.id}
              css={threadItemStyles(isActive)}
              onClick={() => onSelectThread(thread.id)}
              sx={{ pr: 0.5 }}
            >
              <ListItemText
                primary={
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: isActive ? 500 : 400,
                      fontSize: "13px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: isActive ? "#60A5FA" : "rgba(255, 255, 255, 0.85)"
                    }}
                  >
                    {preview}
                  </Typography>
                }
                secondary={
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      color: "rgba(255, 255, 255, 0.35)",
                      fontSize: "11px"
                    }}
                  >
                    {formatThreadDate(thread.updated_at)}
                  </Typography>
                }
                sx={{ my: 0 }}
              />
              <Tooltip title="Delete" arrow>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteThread(thread.id);
                  }}
                  sx={{
                    padding: "4px",
                    opacity: 0.4,
                    color: "rgba(255, 255, 255, 0.5)",
                    "&:hover": {
                      opacity: 1,
                      color: "#FF5555",
                      backgroundColor: "rgba(255, 85, 85, 0.1)"
                    }
                  }}
                >
                  <DeleteIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );
}

export default ThreadList;

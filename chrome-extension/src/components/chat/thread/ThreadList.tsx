/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Box, Typography, IconButton, List, ListItemButton, ListItemText, Tooltip } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import ChatIcon from "@mui/icons-material/Chat";
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
  overflow: "hidden"
});

const listStyles = css({
  flex: 1,
  overflow: "auto",
  padding: "8px"
});

const threadItemStyles = (isActive: boolean) => css({
  borderRadius: "8px",
  marginBottom: "4px",
  backgroundColor: isActive ? "var(--palette-action-selected)" : "transparent",
  "&:hover": {
    backgroundColor: "var(--palette-action-hover)"
  }
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
    return content.slice(0, 50) + (content.length > 50 ? "..." : "");
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
  // Sort threads by updated_at descending
  const sortedThreads = Object.values(threads).sort((a, b) => 
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  if (sortedThreads.length === 0) {
    return (
      <Box css={containerStyles}>
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", p: 3 }}>
          <ChatIcon sx={{ fontSize: 48, color: "text.disabled", mb: 2 }} />
          <Typography variant="body2" color="text.secondary" textAlign="center">
            No conversations yet
          </Typography>
          <Typography variant="caption" color="text.disabled" textAlign="center">
            Start a new chat to begin
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box css={containerStyles}>
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
              sx={{ pr: 1 }}
            >
              <ListItemText
                primary={
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: isActive ? 600 : 400,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {preview}
                  </Typography>
                }
                secondary={
                  <Typography variant="caption" color="text.disabled">
                    {formatThreadDate(thread.updated_at)}
                  </Typography>
                }
              />
              <Tooltip title="Delete">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteThread(thread.id);
                  }}
                  sx={{
                    opacity: 0.5,
                    "&:hover": {
                      opacity: 1,
                      color: "error.main"
                    }
                  }}
                >
                  <DeleteIcon fontSize="small" />
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

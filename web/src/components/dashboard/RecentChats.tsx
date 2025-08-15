/** @jsxImportSource @emotion/react */
import React from "react";
import { Box, Typography } from "@mui/material";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ThreadList from "../chat/thread/ThreadList";
import { Thread } from "../../stores/ApiTypes";
import { ThreadInfo } from "../chat/types/thread.types";

interface RecentChatsProps {
  threads: { [key: string]: Thread };
  currentThreadId: string | null;
  onNewThread: () => void;
  onSelectThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  getThreadPreview: (threadId: string) => string;
}

const styles = (theme: Theme) =>
  css({
    borderRadius: theme.spacing(1),
    padding: theme.spacing(4),
    display: "flex",
    height: "100%",
    overflowY: "auto",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
    ".section-title": {
      color: theme.vars.palette.grey[100],
      marginBottom: theme.spacing(3)
    },
    ".content-scrollable": {
      flex: 1,
      overflow: "auto",
      paddingRight: theme.spacing(1)
    }
  });

const RecentChats: React.FC<RecentChatsProps> = ({
  threads,
  currentThreadId,
  onNewThread,
  onSelectThread,
  onDeleteThread,
  getThreadPreview
}) => {
  const theme = useTheme();
  const sortedAndTransformedThreads = Object.fromEntries(
    Object.entries(threads)
      .sort(([, a], [, b]) => {
        const dateA = a.updated_at || "";
        const dateB = b.updated_at || "";
        return dateB.localeCompare(dateA);
      })
      .slice(0, 5)
      .map(([id, thread]): [string, ThreadInfo] => [
        id,
        {
          id,
          title: thread.title ?? undefined,
          updatedAt: thread.updated_at || new Date().toISOString(),
          messages: [] as any[]
        }
      ])
  );

  return (
    <div className="recent-chats" css={styles(theme)}>
      <Typography variant="h3" className="section-title">
        Recent Chats
      </Typography>
      <Box className="content-scrollable">
        <ThreadList
          threads={sortedAndTransformedThreads}
          currentThreadId={currentThreadId}
          onNewThread={onNewThread}
          onSelectThread={onSelectThread}
          onDeleteThread={onDeleteThread}
          getThreadPreview={getThreadPreview}
        />
      </Box>
    </div>
  );
};

export default RecentChats;

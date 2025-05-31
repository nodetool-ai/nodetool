/** @jsxImportSource @emotion/react */
import React from "react";
import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { createStyles } from "./ThreadList.styles";
import {
  ThreadItem,
  NewChatButton,
  EmptyThreadList,
  ThreadListProps,
  sortThreadsByDate
} from "./";

export type { ThreadInfo } from "./";

const ThreadList: React.FC<ThreadListProps> = ({
  threads,
  currentThreadId,
  onNewThread,
  onSelectThread,
  onDeleteThread,
  getThreadPreview
}) => {
  const theme = useTheme();
  const componentStyles = createStyles(theme);
  return (
    <Box css={componentStyles}>
      <NewChatButton onNewThread={onNewThread} />
      <ul className="thread-list">
        {!threads || Object.keys(threads).length === 0 ? (
          <EmptyThreadList />
        ) : (
          sortThreadsByDate(threads).map(([threadId, thread]) => (
            <ThreadItem
              key={threadId}
              threadId={threadId}
              thread={thread}
              isSelected={threadId === currentThreadId}
              onSelect={() => onSelectThread(threadId)}
              onDelete={() => onDeleteThread(threadId)}
              getPreview={() => getThreadPreview(threadId)}
            />
          ))
        )}
      </ul>
    </Box>
  );
};

export default ThreadList;

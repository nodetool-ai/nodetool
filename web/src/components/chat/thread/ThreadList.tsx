/** @jsxImportSource @emotion/react */
import React from "react";
import { Box, useTheme } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import { createStyles } from "./ThreadList.styles";
import {
  ThreadItem,
  EmptyThreadList,
  ThreadListProps
} from "./";
import { ThreadInfo } from "../types/thread.types";
import { sortThreadsByDate } from "../utils/threadUtils";
import { groupByDate } from "../../../utils/groupByDate";

export type { ThreadInfo } from "./";

const ThreadList: React.FC<ThreadListProps> = ({
  threads,
  currentThreadId,
  onSelectThread,
  onDeleteThread,
  onExportThread,
  getThreadPreview
}) => {
  const theme = useTheme<Theme>();
  const componentStyles = createStyles(theme);
  const listElements: React.ReactNode[] = [];

  if (threads && Object.keys(threads).length > 0) {
    const threadEntries = sortThreadsByDate(threads as Record<string, ThreadInfo>);

    // If there is only one thread, just render it with date
    if (threadEntries.length === 1) {
      const [singleId, singleThread] = threadEntries[0];
      listElements.push(
        <ThreadItem
          key={singleId}
          threadId={singleId}
          thread={singleThread}
          isSelected={singleId === currentThreadId}
          onSelect={() => onSelectThread(singleId)}
          onDelete={() => onDeleteThread(singleId)}
          onExport={onExportThread ? () => onExportThread(singleId) : undefined}
          getPreview={() => getThreadPreview(singleId)}
          showDate={true}
        />
      );
    } else {
      // Group by human-readable relative label
      let lastHeaderLabel: string | null = null;

      const now = new Date();

      threadEntries.forEach(([threadId, thread]) => {
        const dateStr = (thread as any).updated_at || thread.updatedAt;
        const updatedAt = new Date(dateStr);

        const headerLabel = groupByDate(updatedAt, now);

        if (headerLabel !== lastHeaderLabel) {
          listElements.push(
            <li key={`group-${headerLabel}`} className="thread-date-group">
              {headerLabel}
            </li>
          );
          lastHeaderLabel = headerLabel;
        }

        listElements.push(
          <ThreadItem
            key={threadId}
            threadId={threadId}
            thread={thread}
            isSelected={threadId === currentThreadId}
            onSelect={() => onSelectThread(threadId)}
            onDelete={() => onDeleteThread(threadId)}
            onExport={onExportThread ? () => onExportThread(threadId) : undefined}
            getPreview={() => getThreadPreview(threadId)}
            showDate={false}
          />
        );
      });
    }
  }

  return (
    <Box className="thread-list-container" css={componentStyles}>
      <ul className="thread-list">
        {!threads || Object.keys(threads).length === 0 || listElements.length === 0 ? (
          <EmptyThreadList />
        ) : (
          listElements
        )}
      </ul>
    </Box>
  );
};

export default ThreadList;

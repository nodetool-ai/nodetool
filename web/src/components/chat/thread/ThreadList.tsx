/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { createStyles } from "./ThreadList.styles";
import { ThreadItem } from "./ThreadItem";
import { EmptyThreadList } from "./EmptyThreadList";
import ConfirmDialog from "../../dialogs/ConfirmDialog";
import { MOTION } from "../../ui_primitives";
import type { ThreadListProps } from "../types/thread.types";
import { sortThreadsByDate } from "../utils/threadUtils";
import { groupByDate } from "../../../utils/groupByDate";
import { formatDayMonth } from "../../../utils/formatUtils";

export type { ThreadInfo } from "../types/thread.types";

/** Length of the row's exit transition, taken from the style it runs on. */
const DELETE_ANIMATION_MS = Number.parseInt(MOTION.normal, 10);

function formatGroupDate(dateStr: string): string {
  return formatDayMonth(dateStr).toUpperCase();
}

const ThreadList: React.FC<ThreadListProps> = ({
  threads,
  currentThreadId,
  onSelectThread,
  onDeleteThread,
  getThreadPreview,
  isFiltered = false
}) => {
  const theme = useTheme<Theme>();
  const componentStyles = useMemo(() => createStyles(theme), [theme]);
  // The row whose deletion is awaiting confirmation, and the row currently
  // animating out. One dialog for the whole list, not one per row.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const animationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (animationTimer.current !== null) {
        clearTimeout(animationTimer.current);
      }
    },
    []
  );

  const handleRequestDelete = useCallback((threadId: string) => {
    setPendingDeleteId(threadId);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setPendingDeleteId(null);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!pendingDeleteId) {
      return;
    }
    const threadId = pendingDeleteId;
    setDeletingId(threadId);
    animationTimer.current = setTimeout(() => {
      animationTimer.current = null;
      setDeletingId((current) => (current === threadId ? null : current));
      onDeleteThread(threadId);
    }, DELETE_ANIMATION_MS);
  }, [pendingDeleteId, onDeleteThread]);

  const pendingLabel = pendingDeleteId
    ? threads?.[pendingDeleteId]?.title || getThreadPreview(pendingDeleteId)
    : "";

  const listElements = useMemo(() => {
    const elements: React.ReactNode[] = [];

    if (threads && Object.keys(threads).length > 0) {
      const threadEntries = sortThreadsByDate(threads);

      // If there is only one thread, just render it with date
      if (threadEntries.length === 1) {
        const [singleId, singleThread] = threadEntries[0];
        elements.push(
          <ThreadItem
            key={singleId}
            threadId={singleId}
            thread={singleThread}
            isSelected={singleId === currentThreadId}
            isDeleting={singleId === deletingId}
            onSelect={onSelectThread}
            onRequestDelete={handleRequestDelete}
            previewText={getThreadPreview(singleId)}
          />
        );
      } else {
        // Group by human-readable relative label
        let lastHeaderLabel: string | null = null;

        const now = new Date();

        threadEntries.forEach(([threadId, thread]) => {
          const dateStr = thread.updatedAt;
          const updatedAt = new Date(dateStr);

          const headerLabel = groupByDate(updatedAt, now);

          if (headerLabel !== lastHeaderLabel) {
            elements.push(
              <li key={`group-${headerLabel}`} className="thread-date-group">
                <span className="group-label">{headerLabel}</span>
                <span className="group-date">{formatGroupDate(dateStr)}</span>
              </li>
            );
            lastHeaderLabel = headerLabel;
          }

          elements.push(
            <ThreadItem
              key={threadId}
              threadId={threadId}
              thread={thread}
              isSelected={threadId === currentThreadId}
              isDeleting={threadId === deletingId}
              onSelect={onSelectThread}
              onRequestDelete={handleRequestDelete}
              previewText={getThreadPreview(threadId)}
            />
          );
        });
      }
    }

    return elements;
  }, [
    threads,
    currentThreadId,
    deletingId,
    onSelectThread,
    handleRequestDelete,
    getThreadPreview
  ]);

  return (
    <div className="thread-list-container" css={componentStyles}>
      <ul className="thread-list">
        {!threads || Object.keys(threads).length === 0 || listElements.length === 0 ? (
          <EmptyThreadList isFiltered={isFiltered} />
        ) : (
          listElements
        )}
      </ul>
      {pendingDeleteId && (
        <ConfirmDialog
          open
          onClose={handleCancelDelete}
          onConfirm={handleConfirmDelete}
          title="Delete conversation"
          content={`Delete "${pendingLabel}"? This cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
        />
      )}
    </div>
  );
};

export default memo(ThreadList);

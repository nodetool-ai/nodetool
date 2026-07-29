import React, { useState, memo, useCallback } from "react";
import { Text, FlexRow } from "../../ui_primitives";
import { ThreadItemProps } from "../types/thread.types";
import { DeleteButton } from "../../ui_primitives";
import ConfirmDialog from "../../dialogs/ConfirmDialog";

function formatClockTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

const ThreadItemBase: React.FC<ThreadItemProps> = ({
  threadId,
  thread,
  isSelected,
  onSelect,
  onDelete,
  previewText
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDelete = useCallback(() => {
    setIsDeleting(true);
    // Wait for animation to complete before actually deleting
    setTimeout(() => {
      onDelete(threadId);
    }, 300); // Match the CSS animation duration
  }, [threadId, onDelete]);

  const handleSelect = useCallback(() => {
    onSelect(threadId);
  }, [threadId, onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(threadId);
    }
  }, [threadId, onSelect]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmOpen(true);
  }, []);

  const handleConfirmClose = useCallback(() => {
    setConfirmOpen(false);
  }, []);

  return (
    <li
      className={`thread-item ${isSelected ? "selected" : ""} ${isDeleting ? "deleting" : ""}`}
      role="button"
      onClick={handleSelect}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <FlexRow align="center" justify="space-between" gap={1} sx={{ minWidth: 0 }}>
        <Text className="thread-title">
          {thread.title || previewText}
        </Text>
        <Text className="thread-time">
          {formatClockTime(thread.updatedAt)}
        </Text>
      </FlexRow>
      <DeleteButton
        onClick={handleDeleteClick}
      />
      <ConfirmDialog
        open={confirmOpen}
        onClose={handleConfirmClose}
        onConfirm={handleDelete}
        title="Delete conversation"
        content={`Delete "${thread.title || previewText}"? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
      />
    </li>
  );
};

export const ThreadItem = memo(ThreadItemBase, (prevProps, nextProps) => {
  return (
    prevProps.threadId === nextProps.threadId &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.previewText === nextProps.previewText &&
    prevProps.thread.title === nextProps.thread.title &&
    prevProps.thread.updatedAt === nextProps.thread.updatedAt
  );
});

export default ThreadItem;
